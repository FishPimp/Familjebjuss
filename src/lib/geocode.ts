// Adress -> position och område (t.ex. "Aspudden") via OpenStreetMap Nominatim.
// Används bara när man sparar sin adress i profilen.
import { GEOCODER_URL } from '../config'

export interface GeoResult {
  lat: number
  lng: number
  /** Områdesförslag från mest till minst specifikt, t.ex. ["Aspudden", "Hägersten"] */
  areas: string[]
  city: string | null
  postalCode: string | null
  street: string | null
}

interface NominatimAddress {
  road?: string
  house_number?: string
  neighbourhood?: string
  quarter?: string
  suburb?: string
  city_district?: string
  borough?: string
  village?: string
  hamlet?: string
  town?: string
  city?: string
  municipality?: string
  postcode?: string
}

interface NominatimPlace {
  lat: string
  lon: string
  address?: NominatimAddress
}

function toResult(place: NominatimPlace): GeoResult {
  const a = place.address ?? {}
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? null
  const candidates = [a.suburb, a.quarter, a.neighbourhood, a.city_district, a.borough, a.village, a.hamlet, a.town]
    .filter((x): x is string => !!x && x.trim().length > 0)
    // "stadsdelsområde" är för brett (t.ex. Hägersten-Älvsjö), hoppa över
    .filter((x) => !/stadsdelsområde|kommun$/i.test(x))
  const areas = [...new Set(candidates)].filter((x) => x !== city || candidates.length === 1)
  return {
    lat: Number(place.lat),
    lng: Number(place.lon),
    areas: areas.length ? areas : city ? [city] : [],
    city,
    postalCode: a.postcode ?? null,
    street: a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : null,
  }
}

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(path, GEOCODER_URL)
  for (const [k, v] of Object.entries({ format: 'jsonv2', addressdetails: '1', 'accept-language': 'sv', ...params }))
    url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Adressökningen svarade ${res.status}`)
  return res.json()
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  const place = (await get('/reverse', { lat: String(lat), lon: String(lng), zoom: '18' })) as NominatimPlace & {
    error?: string
  }
  if (place.error) throw new Error('Hittade ingen adress på den platsen')
  return { ...toResult(place), lat, lng }
}

export async function searchAddress(street: string, postalCode: string, city: string): Promise<GeoResult | null> {
  const structured = (await get('/search', {
    street,
    postalcode: postalCode.replace(/\s/g, ''),
    city,
    countrycodes: 'se',
    limit: '1',
  })) as NominatimPlace[]
  let place = structured[0]
  if (!place) {
    const free = (await get('/search', {
      q: `${street}, ${postalCode} ${city}`,
      countrycodes: 'se',
      limit: '1',
    })) as NominatimPlace[]
    place = free[0]
  }
  if (!place) return null
  // Hämta områdesnamn för exakt den punkten (sökningen ger ibland färre detaljer)
  try {
    const rev = await reverseGeocode(Number(place.lat), Number(place.lon))
    return { ...rev, areas: rev.areas.length ? rev.areas : toResult(place).areas }
  } catch {
    return toResult(place)
  }
}

export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Din webbläsare kan inte ta fram din position.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? 'Du har inte gett appen tillåtelse att se din plats. Skriv in adressen i stället, eller tillåt plats i webbläsarens inställningar.'
              : 'Kunde inte ta fram din position. Skriv in adressen i stället.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  })
}
