// Allt som är lätt att vilja ändra ligger här: kategorier, storlekar, texter.

export type CategoryId = 'clothes' | 'shoes' | 'gear' | 'toys' | 'books_games' | 'bikes_sports'
export type SizeType = 'clothes' | 'shoes' | 'none'
export type Condition = 'like_new' | 'used_intact' | 'stained_ok'
export type PickupMethod = 'door' | 'home'

export interface Category {
  id: CategoryId
  label: string
  emoji: string
  sizeType: SizeType
  subcategories: string[]
  /** Underkategorier som har en annan storlekstyp än kategorin */
  sizeOverrides?: Record<string, SizeType>
}

export const CATEGORIES: Category[] = [
  {
    id: 'clothes',
    label: 'Kläder',
    emoji: '👕',
    sizeType: 'clothes',
    subcategories: [
      'Body och underställ',
      'Overaller och ytterkläder',
      'Byxor',
      'Tröjor',
      'Klänningar och kjolar',
      'Nattkläder',
      'Badkläder',
      'Regn- och skidkläder',
      'Mössor, vantar och strumpor',
    ],
  },
  {
    id: 'shoes',
    label: 'Skor',
    emoji: '👟',
    sizeType: 'shoes',
    subcategories: ['Gummistövlar', 'Kängor och vinterskor', 'Sneakers', 'Sandaler', 'Innetofflor'],
  },
  {
    id: 'gear',
    label: 'Utrustning',
    emoji: '🍼',
    sizeType: 'none',
    subcategories: ['Barnvagn', 'Bärsele', 'Skötbord', 'Matstol', 'Säng', 'Babysitter'],
  },
  {
    id: 'toys',
    label: 'Leksaker',
    emoji: '🧸',
    sizeType: 'none',
    subcategories: ['Bebis', 'Bygg och pussel', 'Utklädning', 'Utomhus'],
  },
  {
    id: 'books_games',
    label: 'Böcker och spel',
    emoji: '📚',
    sizeType: 'none',
    subcategories: ['Böcker', 'Spel'],
  },
  {
    id: 'bikes_sports',
    label: 'Cyklar och sport',
    emoji: '🚲',
    sizeType: 'none',
    subcategories: ['Cyklar', 'Skridskor', 'Skidor'],
    sizeOverrides: { Skridskor: 'shoes' },
  },
]

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id)

export function sizeTypeFor(category: string, subcategory?: string | null): SizeType {
  const c = categoryById(category)
  if (!c) return 'none'
  if (subcategory && c.sizeOverrides?.[subcategory]) return c.sizeOverrides[subcategory]
  return c.sizeType
}

/** Klädstorlekar i cm med ungefärlig ålder (månader från–till) */
export const CLOTHING_SIZES: { cm: number; label: string; fromMonths: number; toMonths: number }[] = [
  { cm: 44, label: 'För tidigt född', fromMonths: -2, toMonths: 0 },
  { cm: 50, label: '0–1 mån', fromMonths: 0, toMonths: 1 },
  { cm: 56, label: '1–2 mån', fromMonths: 1, toMonths: 2 },
  { cm: 62, label: '2–4 mån', fromMonths: 2, toMonths: 4 },
  { cm: 68, label: '4–6 mån', fromMonths: 4, toMonths: 6 },
  { cm: 74, label: '6–9 mån', fromMonths: 6, toMonths: 9 },
  { cm: 80, label: '9–12 mån', fromMonths: 9, toMonths: 12 },
  { cm: 86, label: '1–1,5 år', fromMonths: 12, toMonths: 18 },
  { cm: 92, label: '1,5–2 år', fromMonths: 18, toMonths: 24 },
  { cm: 98, label: '2–3 år', fromMonths: 24, toMonths: 36 },
  { cm: 104, label: '3–4 år', fromMonths: 36, toMonths: 48 },
  { cm: 110, label: '4–5 år', fromMonths: 48, toMonths: 60 },
  { cm: 116, label: '5–6 år', fromMonths: 60, toMonths: 72 },
  { cm: 122, label: '6–7 år', fromMonths: 72, toMonths: 84 },
  { cm: 128, label: '7–8 år', fromMonths: 84, toMonths: 96 },
  { cm: 134, label: '8–9 år', fromMonths: 96, toMonths: 108 },
  { cm: 140, label: '9–10 år', fromMonths: 108, toMonths: 120 },
  { cm: 146, label: '10–11 år', fromMonths: 120, toMonths: 132 },
  { cm: 152, label: '11–12 år', fromMonths: 132, toMonths: 144 },
  { cm: 158, label: '12–13 år', fromMonths: 144, toMonths: 156 },
  { cm: 164, label: '13–14 år', fromMonths: 156, toMonths: 168 },
  { cm: 170, label: '14–15 år', fromMonths: 168, toMonths: 180 },
]

/** Skostorlekar (EU) */
export const SHOE_SIZES: number[] = Array.from({ length: 25 }, (_, i) => 16 + i)

export const CONDITIONS: { id: Condition; label: string; hint: string }[] = [
  { id: 'like_new', label: 'Som ny', hint: 'Knappt använd' },
  { id: 'used_intact', label: 'Använd men hel', hint: 'Syns att den använts' },
  { id: 'stained_ok', label: 'Fläckig men funkar', hint: 'Duger till lek och lera' },
]
export const conditionLabel = (id: string) => CONDITIONS.find((c) => c.id === id)?.label ?? id

export const PICKUP_METHODS: { id: PickupMethod; label: string; hint: string; emoji: string }[] = [
  { id: 'door', label: 'Kasse på dörren', hint: 'Hämtas när det passar', emoji: '🛍️' },
  { id: 'home', label: 'Jag är hemma', hint: 'Välj en tid', emoji: '🏠' },
]
export const pickupLabel = (id: string) => PICKUP_METHODS.find((p) => p.id === id)?.label ?? id

/** Vanliga barnklädmärken – förslag i sökrutan för varumärke */
export const BRAND_SUGGESTIONS = [
  'Polarn O. Pyret',
  'Lindex',
  'H&M',
  'KappAhl',
  'Name it',
  'Reima',
  'Didriksons',
  'Molo',
  'Mini Rodini',
  'Lindberg',
  'Viking',
  'Kavat',
  'Crocs',
  'Nike',
  'Adidas',
  'Zara',
  'Joha',
  'Engel',
  'Hummel',
  'Stadium',
  'Lego',
  'Brio',
  'Micki',
  'Plantoys',
  'Stokke',
  'BabyBjörn',
  'Emmaljunga',
  'Bugaboo',
  'Cybex',
  'Britax',
]

/** Integritetstextens version. Höj när texten ändras så att användarna godkänner på nytt. */
export const PRIVACY_VERSION = '2026-09-29'

/** Förbered för annonser i flödet (används inte ännu). */
export const FEED_AD_EVERY = 8
export const FEED_ADS_ENABLED = false

/** Adress-sökning (OpenStreetMap Nominatim). Kan bytas mot annan leverantör senare. */
export const GEOCODER_URL = import.meta.env.VITE_GEOCODER_URL || 'https://nominatim.openstreetmap.org'
