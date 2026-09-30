import { useNavigate } from 'react-router'
import { PRIVACY_VERSION } from '../config'
import { PageHeader } from '../components/ui'

export function Privacy() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Integritet" back={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} />
      <article className="space-y-4 p-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
        <p className="text-muted">Version {PRIVACY_VERSION}</p>
        <p>
          Bjuss hjälper grannar att skänka barnsaker till varandra. Vi samlar bara in det som behövs för det, och vi säljer
          aldrig dina uppgifter.
        </p>

        <h2>Vilka uppgifter sparas?</h2>
        <ul>
          <li>
            <strong>E-postadress</strong> – för att du ska kunna logga in. Visas aldrig för andra.
          </li>
          <li>
            <strong>Namn</strong> som du själv väljer – syns för grannar.
          </li>
          <li>
            <strong>Område</strong> (t.ex. "Aspudden") – syns för grannar.
          </li>
          <li>
            <strong>Gatuadress, postnummer och position</strong> – används för att visa saker inom gångavstånd. Adressen
            visas <strong>bara</strong> för den som du själv godkänner att hämta något. Andra ser bara området och ett
            ungefärligt avstånd (avrundat till hundratal meter från en avrundad punkt).
          </li>
          <li>
            <strong>Portkod och instruktion</strong> som du skriver i en annons – visas bara för den du godkänner.
          </li>
          <li>
            <strong>Annonser och bilder</strong> – syns för grannar i närheten. Bilderna rensas från metadata (t.ex. plats
            och tidpunkt) i din telefon innan de laddas upp.
          </li>
          <li>
            <strong>Chattmeddelanden</strong> – syns bara för dig och den du chattar med.
          </li>
          <li>
            <strong>Förfrågningar och hämtningar</strong> – används för kö, pålitlighet och statistik. Andra ser bara
            antal, aldrig vem du gett till eller fått av.
          </li>
        </ul>

        <h2>Bilder</h2>
        <p>
          Visa aldrig barn på bilderna. Fota bara sakerna. Det du fotar ska vara ditt att ge bort.
        </p>

        <h2>Vem behandlar uppgifterna?</h2>
        <ul>
          <li>Supabase (databas, inloggning och bildlagring) – servrar inom EU.</li>
          <li>Vercel (visar själva appen).</li>
          <li>
            OpenStreetMap (Nominatim) – när du söker fram din adress skickas adressen eller positionen dit för att hitta
            ditt område. Inget annat skickas.
          </li>
        </ul>

        <h2>Dina rättigheter</h2>
        <ul>
          <li>Du kan när som helst ändra namn och adress under Profil.</li>
          <li>
            Du kan radera ditt konto under Profil → Radera konto. Då raderas profil, adress, annonser, bilder och chattar
            direkt. Andras statistik behåller bara ett antal, utan koppling till dig.
          </li>
          <li>Du kan begära ut dina uppgifter eller ställa frågor genom att kontakta den som driver Bjuss.</li>
        </ul>

        <h2>Säkerhet</h2>
        <p>
          Databasen har regler på radnivå (Row Level Security) som gör att du bara kan se det du har rätt att se – även om
          någon skulle försöka kringgå appen.
        </p>
      </article>
    </div>
  )
}
