// Översätter felmeddelanden från Supabase och databasen till begriplig svenska.
// Samma förklaringar finns i README under "Felmeddelanden".

const BJUSS_ERRORS: Record<string, string> = {
  BJUSS_NOT_LOGGED_IN: 'Du är inte inloggad. Logga in igen.',
  BJUSS_CONSENT_REQUIRED: 'Du behöver godkänna integritetstexten först.',
  BJUSS_NO_PROFILE: 'Du behöver skapa din profil först.',
  BJUSS_NO_HOME: 'Du behöver ange din adress i profilen först.',
  BJUSS_BAD_POSTAL_CODE: 'Postnumret ska vara fem siffror, t.ex. 126 49.',
  BJUSS_OUTSIDE_SWEDEN: 'Platsen verkar ligga utanför Sverige. Bjuss finns bara i Sverige än så länge.',
  BJUSS_AREA_REQUIRED: 'Välj vilket område du bor i.',
  BJUSS_BAD_PHOTO: 'Bilden laddades inte upp ordentligt. Försök igen.',
  BJUSS_PICKUP_WINDOW_PAST: 'Tiden när du är hemma har redan passerat. Välj en tid framåt.',
  BJUSS_LISTING_NOT_FOUND: 'Annonsen finns inte längre, eller ligger utanför ditt område.',
  BJUSS_LISTING_NOT_AVAILABLE: 'Den här saken är inte ledig just nu.',
  BJUSS_OWN_LISTING: 'Det här är din egen annons.',
  BJUSS_ALREADY_REQUESTED: 'Du står redan i kön för den här.',
  BJUSS_TOO_MANY_OPEN_REQUESTS: 'Du har många obesvarade förfrågningar just nu. Vänta på svar eller ångra någon först.',
  BJUSS_REQUEST_NOT_FOUND: 'Förfrågan hittades inte.',
  BJUSS_REQUEST_NOT_PENDING: 'Förfrågan är redan hanterad.',
  BJUSS_REQUEST_NOT_APPROVED: 'Förfrågan är inte godkänd än.',
  BJUSS_ALREADY_PICKED_UP: 'Den är redan markerad som hämtad.',
  BJUSS_USER_GONE: 'Personen har raderat sitt konto.',
  BJUSS_BLOCKED: 'Ni kan inte kontakta varandra eftersom någon av er har blockerat den andra.',
  BJUSS_CAR_SEAT:
    'Bilbarnstolar och babyskydd kan inte bjussas i Bjuss. De kan ha skador efter en krock som inte syns, och det går inte att veta deras historia. Lämna den hellre till återvinning. Tack för att du förstår! 💛',
  BJUSS_PICKUP_LIMIT:
    'Du har nått månadens gräns för hämtningar. Gränsen finns för att alla grannar ska få chansen. Den nollställs den 1:a nästa månad.',
  BJUSS_TAKER_AT_LIMIT: 'Mottagaren har nått månadens gräns för hämtningar och kan inte godkännas just nu.',
  BJUSS_ALREADY_RATED: 'Du har redan lämnat omdöme.',
  BJUSS_NOT_PICKED_UP: 'Du kan lämna omdöme först efter hämtningen.',
  BJUSS_ADDRESS_CHANGE_LIMIT: 'Du har bytt adress många gånger nyligen. Vänta några dagar och försök igen.',
  BJUSS_AI_LIMIT: 'Du har använt bildtolkningen många gånger i dag. Fyll i fälten själv så länge.',
  BJUSS_REPORT_REASON: 'Välj en anledning till rapporten.',
  BJUSS_CANNOT_BLOCK_SELF: 'Du kan inte blockera dig själv.',
}

interface ErrorLike {
  message?: string
  code?: string
  status?: number
  error_description?: string
}

export function errorMessage(err: unknown): string {
  if (!err) return 'Något gick fel.'
  const e = err as ErrorLike
  const msg = String(e.message ?? e.error_description ?? err)

  const bjuss = msg.match(/BJUSS_[A-Z_]+/)?.[0]
  if (bjuss && BJUSS_ERRORS[bjuss]) return BJUSS_ERRORS[bjuss]

  if (/Email address not authorized/i.test(msg))
    return 'Supabase skickar bara mejl till medlemmar i ditt Supabase-team tills en egen e-posttjänst är kopplad. Se README → "E-post".'
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(msg) || e.status === 429)
    return 'För många försök på kort tid. Vänta en stund och försök igen.'
  if (/token has expired|otp.*(expired|invalid)|invalid.*otp|Token has expired or is invalid/i.test(msg))
    return 'Koden stämmer inte eller har gått ut. Be om en ny kod.'
  if (/for security purposes, you can only request this after/i.test(msg))
    return 'Vänta en minut innan du ber om en ny kod.'
  if (/invalid email|unable to validate email/i.test(msg)) return 'E-postadressen ser inte rätt ut.'
  if (/signups not allowed/i.test(msg)) return 'Nya konton är avstängda just nu.'
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg))
    return 'Ingen kontakt med servern. Kontrollera din internetuppkoppling och försök igen.'
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return 'Du har blivit utloggad. Logga in igen.'
  if (/row-level security|permission denied/i.test(msg)) return 'Du har inte behörighet att göra det här.'
  if (/mime type|invalid_mime_type/i.test(msg)) return 'Bildformatet stöds inte. Ta en ny bild eller välj en JPG-bild.'
  if (/payload too large|exceeded the maximum allowed size/i.test(msg)) return 'Bilden är för stor.'
  if (/bucket not found/i.test(msg))
    return 'Bildlagringen är inte uppsatt. Har databasens SQL-fil körts i Supabase? Se README.'
  if (/could not find the function|schema cache/i.test(msg))
    return 'Databasen är inte uppdaterad med senaste versionen. Se README → "Uppdatera databasen".'
  if (/relation .* does not exist/i.test(msg)) return 'Databasen saknar tabeller. Se README → "Uppdatera databasen".'

  return `Något gick fel: ${msg}`
}
