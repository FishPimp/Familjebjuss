export function SetupMissing() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Bjuss behöver kopplas till Supabase</h1>
      <p>Appen hittar inte sina inställningar. Det betyder att två miljövariabler saknas:</p>
      <ul className="list-disc space-y-1 pl-6 font-mono text-sm">
        <li>VITE_SUPABASE_URL</li>
        <li>VITE_SUPABASE_PUBLISHABLE_KEY</li>
      </ul>
      <p>
        <strong>På Vercel:</strong> Project → Settings → Environment Variables. Lägg in båda värdena (bocka i alla
        miljöer) och gör sedan <em>Redeploy</em>.
      </p>
      <p>
        <strong>På egen dator:</strong> kopiera filen <code>.env.example</code> till <code>.env.local</code> och fyll i
        värdena.
      </p>
      <p className="text-sm text-muted">Värdena hittar du i Supabase under Project Settings → API. Se README.</p>
    </div>
  )
}
