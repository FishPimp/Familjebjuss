# Bjuss

En hyperlokal app där småbarnsföräldrar bjussar bort (skänker) utväxta barnkläder, leksaker och annat till grannar. Inga pengar, inget byte – allt sker till fots.

Appen är en **PWA**: en hemsida som fungerar som en app. Den går att lägga på hemskärmen och kan använda kameran, och fungerar på Android, iPhone (Safari) och dator.

---

## Innehåll

1. [Vad som är byggt](#vad-som-är-byggt)
2. [Kom igång – engångsinställningar](#kom-igång--engångsinställningar) (ca 45 minuter)
3. [Testa på telefonen](#testa-på-telefonen)
4. [Inställningar du kan ändra själv](#inställningar-du-kan-ändra-själv)
5. [Moderering: rapporter och dolda annonser](#moderering-rapporter-och-dolda-annonser)
6. [Felmeddelanden – vad betyder de?](#felmeddelanden--vad-betyder-de)
7. [Val vi har gjort (och varför)](#val-vi-har-gjort-och-varför)
8. [Säkerhet och integritet](#säkerhet-och-integritet)
9. [Kostnader](#kostnader)
10. [För utvecklare](#för-utvecklare)

---

## Vad som är byggt

| Steg | Innehåll | Status |
|---|---|---|
| 1 | Inloggning med kod via mejl, profil med område, annonser med foto, flöde inom 500 m med ungefärligt avstånd, "Vill ha", godkänn, chatt, markera hämtat, radera konto | ✅ Klart |
| 2 | Filter och sök, "Passar mina barn", barnens storlekar och när nästa storlek behövs, kö och 24-timmarsregel, pålitlighetsbetyg, omdöme efter hämtning, rapportera och blockera | ✅ Klart |
| 3 | Claude tolkar fotot och förifyller annonsen, bilbarnstolar spärras, varning för barn på bild och säkerhetsprodukter | ✅ Klart |
| 4 | Öppen statistik på profilen, medaljer, hämtningsgräns per månad | ✅ Klart |
| 5 | Notiser, offline, paketering för Google Play | ⏳ Nästa |
| Senare | Annonser, områdesstatistik som rapport, iOS-app | 📋 Förberett |

---

## Kom igång – engångsinställningar

Du behöver fyra gratiskonton: **Supabase** (databas och inloggning), **GitHub** (har du redan), **Vercel** (visar appen) och **Anthropic** (bildtolkningen, betalas per användning).

> 💡 **Tips:** Gör stegen i ordning och bocka av. Skriv ner lösenord och koder i en lösenordshanterare – aldrig i koden eller i en chatt.

### Steg A – Supabase (databasen)

1. Gå till [supabase.com](https://supabase.com) och skapa ett konto (logga gärna in med GitHub).
2. Klicka **New project**:
   - **Name:** `bjuss`
   - **Database Password:** klicka *Generate a password* och **spara lösenordet** – du behöver det i steg B.
   - **Region:** `North EU (Stockholm)` (viktigt för GDPR – då ligger all data i Sverige).
3. När projektet är klart: kopiera tre saker och spara dem tillfälligt:
   - **Project URL** – t.ex. `https://abcdefghijklmnop.supabase.co` (knappen **Connect** högst upp, eller *Project Settings → Data API*).
   - **Publishable key** – börjar med `sb_publishable_…` (*Project Settings → API Keys*). Heter i äldre projekt *anon public*.
   - **Project ref** – de 20 bokstäverna i adressen, t.ex. `abcdefghijklmnop` (*Project Settings → General → Project ID*).
4. Skapa en **Access token**: klicka på din profilbild → *Account preferences → Access Tokens* → **Generate new token**, döp den till `github`. Kopiera den (den visas bara en gång).

> ⚠️ Det finns också en **secret key / service_role key**. Den ska du **aldrig** kopiera någonstans – appen behöver den inte.

### Steg B – GitHub (så uppdateras databasen automatiskt)

Varje gång koden i `supabase/` ändras kör GitHub automatiskt uppdateringen av din databas och bildtolkningen. Du behöver bara lämna nycklarna en gång:

1. Öppna repot på GitHub → **Settings → Secrets and variables → Actions → New repository secret**.
2. Lägg in dessa (namn exakt som nedan):

| Namn | Värde |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Access token från steg A4 |
| `SUPABASE_DB_PASSWORD` | Databaslösenordet från steg A2 |
| `SUPABASE_PROJECT_REF` | Project ref från steg A3 |
| `ANTHROPIC_API_KEY` | Nyckeln från steg E (kan läggas in senare) |

3. Gå till fliken **Actions → Uppdatera Supabase → Run workflow** (välj grenen `claude/new-session-6y1f46`, eller `main` när koden är sammanslagen). Efter 1–2 minuter ska det bli en grön bock ✅. Då finns alla tabeller, säkerhetsregler och bildtolkningen i din Supabase.

### Steg C – Inloggningsmejlet (kod i stället för länk)

Supabase skickar som standard en länk. Bjuss använder en **sexsiffrig kod** eftersom länkar ofta öppnas i fel webbläsare när appen ligger på hemskärmen.

1. I Supabase: **Authentication → Emails → Templates**.
2. Öppna **Magic Link**. Sätt *Subject* till `Din kod till Bjuss` och ersätt hela innehållet med texten i filen [`supabase/templates/magic_link.html`](supabase/templates/magic_link.html). Spara.
3. Gör likadant med **Confirm signup** (samma text).

Det viktiga är att texten innehåller `{{ .Token }}` – det är där koden hamnar.

### Steg D – E-post till testpersoner

Supabases inbyggda e-post är bara till för test:
- den skickar **bara till medlemmar i ditt Supabase-team**, och
- högst **2 mejl i timmen**.

**Så testar du med två konton nu:** bjud in den andra e-postadressen (t.ex. din partners) under *Organization → Team → Invite member*. Personen måste acceptera inbjudan.

**Inför lansering** kopplar du en riktig e-posttjänst under *Authentication → Emails → SMTP Settings*, t.ex. [Resend](https://resend.com) (kräver en egen domän, t.ex. `bjuss.se`) eller [Brevo](https://brevo.com). Höj sedan gränsen under *Authentication → Rate Limits*.

### Steg E – Anthropic (bildtolkningen)

1. Gå till [console.anthropic.com](https://console.anthropic.com), skapa konto och lägg in ett betalkort under *Billing*.
2. Sätt en **utgiftsgräns** under *Limits* (t.ex. 100 kr/månad) så att du aldrig får en överraskning.
3. **API Keys → Create Key**, döp den till `bjuss`. Kopiera nyckeln.
4. Lägg in den som GitHub-hemlighet `ANTHROPIC_API_KEY` (steg B) och kör **Uppdatera Supabase** igen.

Appen fungerar även utan nyckel – då fyller man bara i fälten själv.

### Steg F – Vercel (appen på nätet)

1. Gå till [vercel.com](https://vercel.com) och logga in med GitHub.
2. **Add New → Project** → välj repot **Familjebjuss** → **Import**.
3. Under **Environment Variables**, lägg in:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL från steg A3 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key från steg A3 |

4. Klicka **Deploy**. Vercel känner själv igen att det är en Vite-app.
5. För att testa grenen med all ny kod: **Deployments** → leta upp den senaste från grenen `claude/new-session-6y1f46` → öppna länken. (När koden slagits ihop med `main` hamnar den på huvudadressen.)

> Ändrar du miljövariablerna senare måste du göra **Redeploy** för att de ska slå igenom.

> **Ber länken om inloggning till Vercel?** Förhandsversioner av grenar är som standard skyddade. Antingen slår du ihop grenen med `main` (då hamnar appen på den öppna huvudadressen), eller så stänger du av skyddet: *Project → Settings → Deployment Protection → Vercel Authentication → Disabled*.

### Steg G (valfritt) – Adress i Supabase

*Authentication → URL Configuration → Site URL*: lägg in din Vercel-adress, t.ex. `https://bjuss.vercel.app`. Det behövs inte för inloggningskoder men gör mejl och framtida funktioner rätt.

---

## Testa på telefonen

1. Öppna Vercel-länken i **Chrome på Android**.
2. Logga in med din e-post → skriv in koden från mejlet.
3. Godkänn integritetstexten, välj namn, tryck **Använd min plats** (eller skriv adressen) och välj ditt område.
4. Tryck **＋ Bjussa** → **Fota** → kontrollera förifyllningen → **Bjussa!**
5. Lägg på hemskärmen: Chrome-menyn **⋮ → Lägg till på startskärmen**.

**Testa hela flödet med två konton** (t.ex. din telefon och en dator, eller din och din partners telefon):

- [ ] Konto 1 bjussar något. Konto 2 (inom 500 m) ser det i flödet med område och "ca X m bort".
- [ ] Konto 2 trycker **Fråga bjussaren** och skriver i chatten.
- [ ] Konto 2 trycker **Vill ha**. Konto 1 ser förfrågan under **Mina** med konto 2:s statistik.
- [ ] Konto 1 trycker **Godkänn**. Konto 2 ser adress och portkod – och bara konto 2.
- [ ] Konto 2 trycker **Jag har hämtat** och lämnar omdöme.
- [ ] Konto 1 ser "1 bjussning" på sin profil.

> Bor ni inte inom 500 m från varandra? Höj radien tillfälligt (se nästa avsnitt).

---

## Inställningar du kan ändra själv

Allt justerbart ligger i en enda rad i databasen: Supabase → **Table Editor → app_settings**. Klicka i en ruta, ändra och spara – det gäller direkt, ingen ny kod behövs.

| Inställning | Standard | Betyder |
|---|---|---|
| `feed_radius_m` | 500 | Hur långt bort (meter) annonser syns |
| `pickup_hours` | 24 | Timmar att hämta efter godkännande, sedan går saken till nästa i kön |
| `max_open_requests` | 10 | Hur många obesvarade "Vill ha" man får ha samtidigt |
| `monthly_pickup_limit` | 5 | Max hämtningar per kalendermånad |
| `free_pickups` | 10 | Så många första hämtningar räknas inte mot gränsen |
| `pickup_notice_at` | 4 | Vid så många hämtningar visas en liten notis |
| `medal_cap_per_taker_month` | 2 | Max medaljpoäng per mottagare och månad (skydd mot fusk) |
| `reports_to_hide` | 3 | Antal olika grannar som måste rapportera för att en annons döljs automatiskt |
| `max_address_changes_30d` | 3 | Hur många gånger man får flytta sin adress per 30 dagar |
| `ai_daily_limit` | 30 | Bildtolkningar per person och dag (håller kostnaden nere) |

Kategorier, storlekar, medaljnamn och texter ändras i koden: [`src/config.ts`](src/config.ts) och [`src/lib/medals.ts`](src/lib/medals.ts).

---

## Moderering: rapporter och dolda annonser

- Alla rapporter hamnar i **Table Editor → reports**. Skriv ett datum i `handled_at` när du har tittat på en.
- En annons som fått rapporter från tre olika grannar döljs automatiskt (`listings.hidden = true`). Vill du visa den igen sätter du `hidden` till `false`.
- Annonser där någon tryckt "Det är inget barn på bilden" trots varningen har `child_warning_overridden = true` – titta gärna på dem.

**Statistik per område** (för framtida rapporter till kommuner och bostadsbolag): kör i *SQL Editor*:

```sql
select * from private.area_stats order by month desc, pickups desc;
```

---

## Felmeddelanden – vad betyder de?

### I appen

| Meddelande | Vad det betyder | Gör så här |
|---|---|---|
| *Bjuss behöver kopplas till Supabase* | Miljövariablerna saknas i Vercel | Steg F, sedan **Redeploy** |
| *Supabase skickar bara mejl till medlemmar i ditt Supabase-team…* | Inbyggd e-post används och adressen är inte med i teamet | Steg D |
| *För många försök på kort tid* | Mejlgränsen (2 per timme) eller för många koder | Vänta en timme, eller koppla egen e-posttjänst (steg D) |
| *Koden stämmer inte eller har gått ut* | Fel kod, eller äldre än en timme | Tryck **Skicka ny kod** |
| *Vi har skickat en kod…* men mejlet innehåller en länk | Mejlmallen är inte ändrad | Steg C |
| *Databasen är inte uppdaterad med senaste versionen* | Migreringarna har inte körts | GitHub → Actions → **Uppdatera Supabase** → Run workflow |
| *Bildlagringen är inte uppsatt* | Samma som ovan | Samma som ovan |
| *Du har inte gett appen tillåtelse att se din plats* | Platsdelning blockerad i webbläsaren | Skriv adressen, eller tillåt plats: Chrome → ⋮ → Inställningar → Webbplatsinställningar → Plats |
| *Vi hittade inte adressen* | OpenStreetMap hittade inte gatan | Kontrollera stavningen, eller använd **Använd min plats** hemma |
| *Du har bytt adress många gånger nyligen* | Skydd mot att "flytta runt" för att se andra områden | Vänta, eller höj `max_address_changes_30d` |
| *Bilbarnstolar och babyskydd kan inte bjussas* | Spärren mot bilbarnstolar | Avsiktligt – bilbarnstolar får inte skänkas |
| *Du har nått månadens gräns för hämtningar* | 5 hämtningar denna månad | Nollställs den 1:a |
| *Bildtolkningen fungerade inte just nu* | Claude svarade inte | Fyll i själv; kontrollera Anthropic-nyckel och saldo |
| *Ingen kontakt med servern* | Ingen internetuppkoppling, eller Supabase-projektet pausat | Kontrollera nätet; väck projektet i Supabase (gratisprojekt pausas efter en veckas inaktivitet) |
| *Du har inte behörighet att göra det här* | Databasens säkerhetsregler stoppade något | Logga ut och in; hör av dig om det fortsätter |

### I GitHub Actions (röda kryss ❌)

| Fel | Betyder | Gör så här |
|---|---|---|
| Gul varning *Supabase är inte kopplat än* | Hemligheterna saknas | Steg B |
| `Invalid access token format` / `Unauthorized` | Fel eller utgången access token | Skapa ny token (steg A4), uppdatera `SUPABASE_ACCESS_TOKEN` |
| `password authentication failed` | Fel databaslösenord | *Project Settings → Database → Reset database password*, uppdatera `SUPABASE_DB_PASSWORD` |
| `Project not found` / `Invalid project ref` | Fel project ref | Kontrollera `SUPABASE_PROJECT_REF` (20 tecken) |
| Testet **Databas och webbläsare** misslyckas | En automatisk kontroll hittade ett fel i koden | Be Claude titta på loggen |

---

## Val vi har gjort (och varför)

- **Ingen hämtningskod** (ditt val): hämtningen markeras med knappar. Bara mottagarens "Jag har hämtat" räknas som bekräftad bjussning – det är den som ger medaljer. Givaren kan markera som reserv.
- **Område från OpenStreetMap**, t.ex. "Aspudden", i stället för postnummerort (som bara hade sagt "Hägersten"). Man väljer själv bland förslagen.
- **Ungefärligt avstånd** räknas från en avrundad punkt (rutnät på ca 200 m) och avrundas till hundratal meter. Då går det inte att räkna ut var någon bor. Flödet utgår alltid från ditt sparade hem – det går inte att "fråga" från andra platser.
- **Chatten** finns från första frågan. Man skriver fritt och kan dela telefonnummer, precis som på Blocket och Vinted. Adress och portkod visas automatiskt överst i chatten för den godkända mottagaren.
- **Kö och 24 timmar:** hämtar man inte i tid blir saken ledig igen, den som står först i kön får ett meddelande och givaren godkänner nästa. Vi godkänner inte automatiskt, eftersom adressen bara ska lämnas ut till den givaren själv valt.
- **Hämtningsgränsen** gäller per kalendermånad (nollställs den 1:a). Godkända men ännu inte hämtade saker räknas, så att man inte kan boka förbi gränsen.
- **Fusk med medaljer:** medaljpoäng kräver mottagarens bekräftelse och räknas högst två gånger per mottagare och månad. Andra skydd: gräns för adressbyten, gräns för antal obesvarade förfrågningar, rapportering som döljer annonser automatiskt.
- **Medaljnamn (förslag):** 🛍️ Första kassen (5), 🚪 Dörrhjälte (10), 😇 Trappuppgångens ängel (25), 🥇 Guldgranne (50), 💛 Hundra hjärtan (100), 👑 Bjussmästare (250), 🏆 Kvarterslegend (500).
- **Claude-modell:** `claude-opus-5-5` med låg "effort" (snabbt och billigt nog för att tolka en bild). Om Claude av säkerhetsskäl avböjer en bild försöker servern automatiskt med en annan modell (*fallback*). Modellen kan bytas med hemligheten `ANTHROPIC_MODEL` i Supabase.

**Fler risker vi ser (förslag till senare):**
- Den som skapar många e-postkonton kan kringgå hämtningsgränsen. Motåtgärd: verifiering med BankID eller mobilnummer för fler än X hämtningar.
- Någon kan hämta saker för att sälja vidare. Motåtgärd: gränsen, rapportering ("Säljs – är inte gratis") och synlig statistik ("Bjussat 0, hämtat 14").
- Falska adresser. Motåtgärd: gräns för adressbyten (finns), senare adressverifiering.

---

## Säkerhet och integritet

- **Row Level Security** på alla tabeller: databasen själv bestämmer vem som ser vad, även om någon manipulerar appen. Över 130 automatiska kontroller testar detta.
- **Gatuadress, GPS-position och portkod** ligger i ett privat schema som appen inte kan läsa direkt. De lämnas bara ut till den mottagare som givaren godkänt, och döljs igen efter hämtning.
- **Bilder** krymps i telefonen och all metadata (EXIF, GPS, kameramodell) tas bort innan uppladdning. Bilderna ligger i privat lagring och visas via tillfälliga länkar.
- **Nycklar** finns aldrig i koden. Claude-nyckeln finns bara på servern (Supabase Edge Function).
- **GDPR:** samtycke vid registrering, integritetstext på svenska (i appen under *Integritet*), radera konto och all data under *Profil*, data i EU (Stockholm).

---

## Kostnader

| Tjänst | Kostnad |
|---|---|
| Supabase | Gratis upp till 500 MB databas och 1 GB bilder. Gratisprojekt pausas efter en veckas inaktivitet (väcks med ett klick). |
| Vercel | Gratis för hobbyprojekt. |
| Anthropic | Cirka 20–30 öre per tolkad bild. Max 30 bilder per person och dag (`ai_daily_limit`). Sätt en utgiftsgräns i Anthropic Console. |
| OpenStreetMap | Gratis vid låg användning. Vid många användare byter vi till en betald adresstjänst. |

---

## För utvecklare

### Teknik

- **App:** React 19 + TypeScript + Vite + Tailwind CSS, React Router, TanStack Query
- **Backend:** Supabase (Postgres + PostGIS, Auth med e-postkod, Storage, Realtime, Edge Functions)
- **Bildtolkning:** Claude via Anthropics TypeScript-SDK i en Edge Function (Deno)
- **Hosting:** Vercel. Databasen uppdateras via GitHub Actions.

### Mappar

```
src/                      appen
  config.ts               kategorier, storlekar, texter, säkerhetsord
  lib/                    Supabase-anslutning, bildrensning, adressökning, storleksberäkning, medaljer
  pages/                  en fil per skärm
  components/             återanvändbara delar
supabase/
  migrations/             databasen steg för steg (tabeller, RLS, funktioner)
  functions/analyze-photo Edge Function som frågar Claude
  templates/              inloggningsmejlet
  tests/                  databastester (säkerhetsregler och logik)
e2e/                      webbläsartester som klickar igenom appen
scripts/local/            lokal "mini-Supabase" för tester
.github/workflows/        tester och automatisk uppdatering av Supabase
```

### Köra lokalt (Linux, kräver PostgreSQL 16 + PostGIS + pg_cron, Node 22, root för `runuser`)

```bash
npm install
bash scripts/local/start.sh     # startar databas, Auth, API, lagring, låtsas-e-post och låtsas-Claude
bash scripts/local/test-db.sh   # databastester
npm test                        # enhetstester
npm run test:e2e                # webbläsartester (startar Vite själv)
```

Mot riktiga Supabase: kopiera `.env.example` till `.env.local`, fyll i värdena och kör `npm run dev`.
