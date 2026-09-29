// Lokal "mini-Supabase"-gateway för utveckling och automatiska tester.
//
//   /auth/v1/*      -> Supabase Auth (GoTrue) på port 9999
//   /rest/v1/*      -> PostgREST på port 3000
//   /storage/v1/*   -> förenklad bildlagring (filer på disk, samma radnivåregler som Supabase)
//   /functions/v1/* -> Edge Functions via Deno på port 9998 (om den körs)
//   /__mail/latest  -> senaste mejlet som "skickats" till en adress (fångas av en låtsas-SMTP)
//
// Används aldrig i produktion.

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { SMTPServer } from 'smtp-server'
import { simpleParser } from 'mailparser'

const PORT = Number(process.env.GATEWAY_PORT ?? 54321)
const JWT_SECRET = process.env.JWT_SECRET
const STORAGE_DIR = process.env.STORAGE_DIR
const TEMPLATE_DIR = process.env.TEMPLATE_DIR
const DB_URL = process.env.DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

const pool = new pg.Pool({ connectionString: DB_URL, max: 5 })
const mails = []

// ---------- JWT (HS256) ----------
const b64url = (buf) => Buffer.from(buf).toString('base64url')
export function signJwt(payload, secret = JWT_SECRET) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}
function verifyJwt(token) {
  const [h, b, s] = token.split('.')
  if (!h || !b || !s) return null
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString())
  if (payload.exp && payload.exp < Date.now() / 1000) return null
  return payload
}

// ---------- hjälpfunktioner ----------
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
  'access-control-allow-headers':
    'authorization, x-client-info, apikey, content-type, x-upsert, prefer, range, accept-profile, content-profile, x-supabase-api-version, cache-control, x-retry-count',
  'access-control-expose-headers': 'content-range, content-location, x-supabase-api-version',
}
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body)
  res.writeHead(status, {
    ...CORS,
    'content-type': isBuf ? 'application/octet-stream' : 'application/json',
    ...headers,
  })
  res.end(isBuf ? body : JSON.stringify(body))
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
function proxy(req, res, port, stripPrefix) {
  const target = req.url.slice(stripPrefix.length) || '/'
  const headers = { ...req.headers, host: `127.0.0.1:${port}` }
  const p = http.request({ host: '127.0.0.1', port, path: target, method: req.method, headers }, (pres) => {
    const h = { ...pres.headers, ...CORS }
    res.writeHead(pres.statusCode ?? 502, h)
    pres.pipe(res)
  })
  p.on('error', (e) => send(res, 502, { message: `Tjänsten på port ${port} svarar inte: ${e.message}` }))
  req.pipe(p)
}
function claimsFrom(req) {
  const auth = req.headers.authorization ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const claims = token ? verifyJwt(token) : null
  return claims ?? { role: 'anon' }
}
async function asUser(claims, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const role = ['anon', 'authenticated', 'service_role'].includes(claims.role) ? claims.role : 'anon'
    await client.query(`set local role ${role}`)
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
const filePath = (bucket, name) => path.join(STORAGE_DIR, bucket, ...name.split('/'))

// ---------- låtsas-Storage ----------
async function storage(req, res, url) {
  const claims = claimsFrom(req)
  const parts = url.pathname.replace(/^\/storage\/v1\//, '').split('/').map(decodeURIComponent)

  // GET /object/sign/{bucket}/{path}?token=
  if (req.method === 'GET' && parts[0] === 'object' && parts[1] === 'sign') {
    const bucket = parts[2]
    const name = parts.slice(3).join('/')
    const payload = verifyJwt(url.searchParams.get('token') ?? '')
    if (!payload || payload.url !== `${bucket}/${name}`) return send(res, 400, { error: 'InvalidSignature' })
    const meta = await pool.query('select metadata from storage.objects where bucket_id=$1 and name=$2', [bucket, name])
    if (!meta.rowCount || !fs.existsSync(filePath(bucket, name))) return send(res, 404, { error: 'not_found' })
    return send(res, 200, fs.readFileSync(filePath(bucket, name)), {
      'content-type': meta.rows[0].metadata?.mimetype ?? 'application/octet-stream',
    })
  }

  // POST /object/sign/{bucket}  (flera)  eller  /object/sign/{bucket}/{path}
  if (req.method === 'POST' && parts[0] === 'object' && parts[1] === 'sign') {
    const bucket = parts[2]
    const body = JSON.parse((await readBody(req)).toString() || '{}')
    const expiresIn = Number(body.expiresIn ?? 60)
    const signOne = (name) =>
      `/object/sign/${bucket}/${name}?token=${signJwt({ url: `${bucket}/${name}`, exp: Math.floor(Date.now() / 1000) + expiresIn })}`
    const single = parts.slice(3).join('/')
    const names = single ? [single] : body.paths ?? []
    const visible = await asUser(claims, async (c) => {
      const r = await c.query('select name from storage.objects where bucket_id=$1 and name = any($2)', [bucket, names])
      return new Set(r.rows.map((x) => x.name))
    })
    if (single) {
      if (!visible.has(single)) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
      return send(res, 200, { signedURL: signOne(single) })
    }
    return send(
      res,
      200,
      names.map((n) => (visible.has(n) ? { error: null, path: n, signedURL: signOne(n) } : { error: 'Either the object does not exist or you do not have access to it', path: n, signedURL: null })),
    )
  }

  // POST /object/list/{bucket}
  if (req.method === 'POST' && parts[0] === 'object' && parts[1] === 'list') {
    const bucket = parts[2]
    const body = JSON.parse((await readBody(req)).toString() || '{}')
    const prefix = (body.prefix ?? '').replace(/\/$/, '')
    const rows = await asUser(claims, async (c) => {
      const r = await c.query(
        `select id, name, created_at, updated_at, last_accessed_at, metadata from storage.objects
         where bucket_id=$1 and name like $2 order by name limit $3 offset $4`,
        [bucket, prefix ? `${prefix}/%` : '%', body.limit ?? 100, body.offset ?? 0],
      )
      return r.rows
    })
    return send(
      res,
      200,
      rows.map((r) => ({ ...r, name: prefix ? r.name.slice(prefix.length + 1) : r.name })).filter((r) => !r.name.includes('/')),
    )
  }

  // DELETE /object/{bucket}  body {prefixes}
  if (req.method === 'DELETE' && parts[0] === 'object' && parts.length === 2) {
    const bucket = parts[1]
    const body = JSON.parse((await readBody(req)).toString() || '{}')
    const deleted = await asUser(claims, async (c) => {
      const r = await c.query('delete from storage.objects where bucket_id=$1 and name = any($2) returning *', [bucket, body.prefixes ?? []])
      return r.rows
    })
    for (const d of deleted) fs.rmSync(filePath(bucket, d.name), { force: true })
    return send(res, 200, deleted)
  }

  // POST/PUT /object/{bucket}/{path}  (uppladdning)
  if ((req.method === 'POST' || req.method === 'PUT') && parts[0] === 'object') {
    const bucket = parts[1]
    const name = parts.slice(2).join('/')
    const raw = await readBody(req)
    let data = raw
    let mimetype = req.headers['content-type'] ?? 'application/octet-stream'
    if (mimetype.startsWith('multipart/form-data')) {
      const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': mimetype }, body: raw }).formData()
      const file = [...form.values()].find((v) => typeof v !== 'string')
      if (!file) return send(res, 400, { statusCode: '400', error: 'InvalidRequest', message: 'Ingen fil' })
      data = Buffer.from(await file.arrayBuffer())
      mimetype = file.type || 'application/octet-stream'
    }
    const b = await pool.query('select * from storage.buckets where id=$1', [bucket])
    if (!b.rowCount) return send(res, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' })
    const bucketRow = b.rows[0]
    if (bucketRow.file_size_limit && data.length > Number(bucketRow.file_size_limit))
      return send(res, 400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' })
    if (bucketRow.allowed_mime_types?.length && !bucketRow.allowed_mime_types.includes(mimetype))
      return send(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${mimetype} is not supported` })
    try {
      const row = await asUser(claims, async (c) => {
        const r = await c.query(
          `insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ($1,$2,$3,$4,$5) returning id`,
          [bucket, name, claims.sub ?? null, claims.sub ?? null, { mimetype, size: data.length }],
        )
        return r.rows[0]
      })
      fs.mkdirSync(path.dirname(filePath(bucket, name)), { recursive: true })
      fs.writeFileSync(filePath(bucket, name), data)
      return send(res, 200, { Id: row.id, Key: `${bucket}/${name}` })
    } catch (e) {
      const rls = /row-level security/.test(e.message)
      const dup = /duplicate key/.test(e.message)
      return send(res, 400, {
        statusCode: rls ? '403' : dup ? '409' : '500',
        error: rls ? 'Unauthorized' : dup ? 'Duplicate' : 'internal',
        message: e.message,
      })
    }
  }

  return send(res, 404, { message: `Låtsas-Storage stödjer inte ${req.method} ${url.pathname}` })
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {})
    const url = new URL(req.url, `http://localhost:${PORT}`)
    if (url.pathname.startsWith('/auth/v1/')) return proxy(req, res, 9999, '/auth/v1')
    if (url.pathname.startsWith('/rest/v1/')) return proxy(req, res, 3000, '/rest/v1')
    if (url.pathname.startsWith('/functions/v1/')) return proxy(req, res, 9998, '/functions/v1')
    if (url.pathname.startsWith('/storage/v1/')) return await storage(req, res, url)
    if (url.pathname.startsWith('/__templates/')) {
      const f = path.join(TEMPLATE_DIR, path.basename(url.pathname))
      return send(res, 200, fs.readFileSync(f), { 'content-type': 'text/html; charset=utf-8' })
    }
    if (url.pathname === '/__mail/latest') {
      const to = (url.searchParams.get('to') ?? '').toLowerCase()
      const m = [...mails].reverse().find((x) => x.to.includes(to))
      return m ? send(res, 200, m) : send(res, 404, { message: 'Inget mejl' })
    }
    if (url.pathname === '/__health') return send(res, 200, { ok: true })
    if (url.pathname.startsWith('/realtime/')) return send(res, 404, { message: 'Realtime finns inte lokalt' })
    return send(res, 404, { message: 'Okänd sökväg' })
  } catch (e) {
    console.error(e)
    send(res, 500, { message: String(e?.message ?? e) })
  }
})
server.listen(PORT, () => console.log(`gateway på http://localhost:${PORT}`))

// ---------- låtsas-SMTP som fångar mejl ----------
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onAuth(_auth, _session, cb) {
    cb(null, { user: 'test' })
  },
  onData(stream, _session, cb) {
    simpleParser(stream)
      .then((parsed) => {
        mails.push({
          to: (parsed.to?.text ?? '').toLowerCase(),
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          at: new Date().toISOString(),
        })
        cb()
      })
      .catch(cb)
  },
})
smtp.listen(2500, '127.0.0.1', () => console.log('smtp på 2500'))
