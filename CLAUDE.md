# Bjuss – anteckningar för Claude

Ägaren är inte utvecklare: förklara val i klartext på svenska, bygg i små steg och verifiera själv innan push.

## Viktigt
- UI-texter och README på svenska. Identifierare i koden på engelska, kommentarer på svenska.
- Databasen ändras ENDAST via nya filer i `supabase/migrations/` (`<YYYYMMDDHHMMSS>_namn.sql`). Ändra aldrig en migrering som redan körts mot Supabase. Avsluta varje migrering med `select private.secure_functions();` (sätter rätt rättigheter på funktioner; uppdatera listan i den funktionen om RLS-policies behöver nya hjälpfunktioner).
- Nya tabeller i `public`: slå på RLS, `revoke all ... from anon, authenticated`, och ge uttryckliga `grant` (Supabase exponerar inte längre nya tabeller automatiskt).
- Privat data (adress, position, portkod) ligger i schemat `private` och lämnas bara ut via `security definer`-funktioner med `set search_path = ''`.
- Felkoder från databasen heter `BJUSS_*` och översätts i `src/lib/errors.ts` (håll README:s feltabell i synk).
- Kategorilistan finns både i `src/config.ts` och `supabase/functions/_shared/catalog.ts` – ett test kontrollerar att de är lika.
- Claude-anropet finns i `supabase/functions/analyze-photo/handler.ts` (modell `claude-opus-5-5`, structured outputs, `fallbacks: 'default'`).

## Verifiera före push
```bash
bash scripts/local/start.sh      # lokal mini-Supabase (Postgres+PostGIS, GoTrue, PostgREST, låtsas-Storage/SMTP/Claude, Deno-funktioner)
bash scripts/local/test-db.sh    # databastester i supabase/tests
npx tsc --noEmit -p tsconfig.json && npm test
npm run test:e2e                 # Playwright mot lokala stacken
```
I molnmiljön: starta Docker-lösa stacken ovan; Postgres kräver `apt-get install postgresql-16-postgis-3 postgresql-16-cron` om det saknas.
