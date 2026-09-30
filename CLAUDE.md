# Bjuss – anteckningar för Claude

Ägaren är inte utvecklare: förklara val i klartext på svenska, bygg i små steg och verifiera själv innan push.

**Inga kostnader:** ägaren vill inte betala för något. Använd bara gratisnivåer (Supabase, Vercel, GitHub, OpenStreetMap). Inga betalda API:er (t.ex. AI-tjänster), ingen egen domän, inga app-butiksavgifter. Föreslå aldrig något som kostar utan att tydligt säga det först.

## Viktigt
- UI-texter och README på svenska. Identifierare i koden på engelska, kommentarer på svenska.
- Databasen ändras ENDAST via nya filer i `supabase/migrations/` (`<YYYYMMDDHHMMSS>_namn.sql`). Ändra aldrig en migrering som redan körts mot Supabase. Avsluta varje migrering med `select private.secure_functions();` (sätter rätt rättigheter på funktioner; uppdatera listan i den funktionen om RLS-policies behöver nya hjälpfunktioner).
- Nya tabeller i `public`: slå på RLS, `revoke all ... from anon, authenticated`, och ge uttryckliga `grant` (Supabase exponerar inte längre nya tabeller automatiskt).
- Privat data (adress, position, portkod) ligger i schemat `private` och lämnas bara ut via `security definer`-funktioner med `set search_path = ''`.
- Felkoder från databasen heter `BJUSS_*` och översätts i `src/lib/errors.ts` (håll README:s feltabell i synk).
- Bilbarnstolar spärras med ordlistan i `src/config.ts` (`mentionsCarSeat`) och samma regex i databasen (`private.mentions_car_seat`) – håll dem lika.

## Verifiera före push
```bash
bash scripts/local/start.sh      # lokal mini-Supabase (Postgres+PostGIS, GoTrue, PostgREST, låtsas-Storage/SMTP)
bash scripts/local/test-db.sh    # databastester i supabase/tests
npx tsc --noEmit -p tsconfig.json && npm test
npm run test:e2e                 # Playwright mot lokala stacken
```
I molnmiljön: starta Docker-lösa stacken ovan; Postgres kräver `apt-get install postgresql-16-postgis-3 postgresql-16-cron` om det saknas.
