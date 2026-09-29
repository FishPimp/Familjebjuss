// Edge Function: tolkar ett foto med Claude och föreslår kategori, storlek, skick m.m.
//
// Hemligheter (sätts i Supabase: Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY   – din nyckel från console.anthropic.com (krävs)
//   ANTHROPIC_MODEL     – valfri, standard "claude-opus-5-5"
// SUPABASE_URL och SUPABASE_ANON_KEY finns automatiskt i Supabase.
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0'
import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { CATEGORY_SUBCATEGORIES, CLOTHING_SIZES_CM, CONDITIONS } from '../_shared/catalog.ts'

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5-5'
const MAX_IMAGE_BYTES = 1_500_000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const ALL_SUBCATEGORIES = [...new Set(Object.values(CATEGORY_SUBCATEGORIES).flat())]

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'category',
    'subcategory',
    'size_cm',
    'shoe_size',
    'quantity',
    'condition',
    'brand',
    'description',
    'contains_car_seat',
    'contains_child',
    'safety_product',
    'confidence',
  ],
  properties: {
    category: { type: 'string', enum: Object.keys(CATEGORY_SUBCATEGORIES) },
    subcategory: { anyOf: [{ type: 'string', enum: ALL_SUBCATEGORIES }, { type: 'null' }] },
    size_cm: { anyOf: [{ type: 'integer', enum: CLOTHING_SIZES_CM }, { type: 'null' }] },
    shoe_size: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    quantity: { type: 'integer' },
    condition: { type: 'string', enum: CONDITIONS },
    brand: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    description: { type: 'string' },
    contains_car_seat: { type: 'boolean' },
    contains_child: { type: 'boolean' },
    safety_product: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
}

const SYSTEM = `Du hjälper föräldrar i appen Bjuss att lägga upp barnsaker som de skänker bort till grannar.
Du får ett foto på en eller flera saker (ofta en hög med kläder). Fyll i fälten utifrån bilden.

Fält:
- category: clothes (kläder), shoes (skor), gear (utrustning), toys (leksaker), books_games (böcker och spel), bikes_sports (cyklar och sport).
- subcategory: exakt en av underkategorierna som hör till vald kategori, eller null om du är osäker:
${Object.entries(CATEGORY_SUBCATEGORIES)
  .map(([c, subs]) => `  ${c}: ${subs.join(' | ')}`)
  .join('\n')}
- size_cm: klädstorlek i cm, bara för kläder. Läs storleksetiketten om den syns; annars uppskatta från plaggets storlek. null om det inte går eller inte är kläder.
- shoe_size: EU-storlek för skor och skridskor om den syns eller går att uppskatta, annars null.
- quantity: antal plagg eller saker på bilden (minst 1).
- condition: like_new (som ny), used_intact (använd men hel), stained_ok (fläckig eller sliten men funkar). Välj used_intact om du är osäker.
- brand: märket om det syns tydligt på etikett eller logga, annars null. Gissa aldrig.
- description: en kort saklig mening på svenska (högst 120 tecken), t.ex. färger och antal. Nämn aldrig personer.
- contains_car_seat: true om bilden visar en bilbarnstol, ett babyskydd, en bältesstol eller en bälteskudde.
- contains_child: true om ett barn eller ett barns ansikte syns på bilden. Dockor, gosedjur och tryck på kläder räknas inte.
- safety_product: true för hjälmar, sängar och spjälsängar, bärselar, babysitters, matstolar, barnvagnar, grindar och liknande säkerhetsprodukter.
- confidence: high, medium eller low – hur säker du är på kategori och storlek.`

export interface Suggestion {
  category: string
  subcategory: string | null
  size_cm: number | null
  shoe_size: number | null
  quantity: number
  condition: string
  brand: string | null
  description: string
  contains_car_seat: boolean
  contains_child: boolean
  safety_product: boolean
  confidence: string
}

/** Rensar svaret så att appen bara får giltiga värden. */
export function sanitize(raw: Suggestion): Suggestion {
  const category = CATEGORY_SUBCATEGORIES[raw.category] ? raw.category : 'clothes'
  const subs = CATEGORY_SUBCATEGORIES[category]
  return {
    ...raw,
    category,
    subcategory: raw.subcategory && subs.includes(raw.subcategory) ? raw.subcategory : null,
    size_cm: category === 'clothes' && raw.size_cm && CLOTHING_SIZES_CM.includes(raw.size_cm) ? raw.size_cm : null,
    shoe_size: raw.shoe_size && raw.shoe_size >= 16 && raw.shoe_size <= 40 ? raw.shoe_size : null,
    quantity: Math.min(200, Math.max(1, Math.round(raw.quantity || 1))),
    condition: CONDITIONS.includes(raw.condition) ? raw.condition : 'used_intact',
    brand: raw.brand?.trim() ? raw.brand.trim().slice(0, 60) : null,
    description: (raw.description ?? '').trim().slice(0, 200),
  }
}

function publishableKey(): string {
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (anon) return anon
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
    return Object.values(keys)[0] ?? ''
  } catch {
    return ''
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json(503, { error: 'AI_NOT_CONFIGURED', message: 'ANTHROPIC_API_KEY saknas i Supabase Secrets.' })

  // 1. Kontrollera inloggning och dagskvot (databasen avvisar ogiltiga inloggningar)
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'BJUSS_NOT_LOGGED_IN' })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const quota = await supabase.rpc('consume_ai_quota')
  if (quota.error) {
    const code = quota.error.message.match(/BJUSS_[A-Z_]+/)?.[0] ?? 'BJUSS_NOT_LOGGED_IN'
    return json(code === 'BJUSS_AI_LIMIT' ? 429 : 401, { error: code })
  }

  // 2. Läs bilden
  let image: string
  try {
    const body = (await req.json()) as { image?: string }
    image = (body.image ?? '').replace(/^data:image\/\w+;base64,/, '')
  } catch {
    return json(400, { error: 'BAD_REQUEST' })
  }
  if (!image || image.length * 0.75 > MAX_IMAGE_BYTES) return json(400, { error: 'BAD_IMAGE' })

  // 3. Fråga Claude
  const client = new Anthropic({ apiKey })
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: 'Tolka bilden och fyll i fälten.' },
          ],
        },
      ],
    })
    if (response.stop_reason === 'refusal') return json(422, { error: 'AI_REFUSED' })
    if (response.stop_reason === 'max_tokens') return json(502, { error: 'AI_INCOMPLETE' })
    const text = response.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return json(502, { error: 'AI_EMPTY' })
    const suggestion = sanitize(JSON.parse(text.text) as Suggestion)
    return json(200, { suggestion, remaining_today: quota.data })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'AI_BUSY' })
    if (e instanceof Anthropic.AuthenticationError) return json(503, { error: 'AI_BAD_KEY' })
    if (e instanceof Anthropic.APIError) return json(502, { error: 'AI_ERROR', status: e.status })
    if (e instanceof SyntaxError) return json(502, { error: 'AI_BAD_JSON' })
    console.error(e)
    return json(500, { error: 'INTERNAL' })
  }
}
