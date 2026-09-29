// Kör Edge Functions lokalt på port 9998 (gatewayen skickar /functions/v1/* hit).
import { handler as analyzePhoto } from '../../supabase/functions/analyze-photo/handler.ts'

const routes: Record<string, (req: Request) => Promise<Response>> = {
  'analyze-photo': analyzePhoto,
}

Deno.serve({ port: 9998, hostname: '127.0.0.1' }, (req) => {
  const name = new URL(req.url).pathname.split('/').filter(Boolean)[0] ?? ''
  const fn = routes[name]
  return fn ? fn(req) : new Response('Okänd funktion', { status: 404 })
})
