import { CLOTHING_SIZES, categoryById, sizeTypeFor } from '../config'

const tz = 'Europe/Stockholm'

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today.getTime() + 86400000)
  const sameDay = (a: Date, b: Date) =>
    a.toLocaleDateString('sv-SE', { timeZone: tz }) === b.toLocaleDateString('sv-SE', { timeZone: tz })
  const time = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz })
  if (sameDay(d, today)) return `i dag ${time}`
  if (sameDay(d, tomorrow)) return `i morgon ${time}`
  return `${d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })} ${time}`
}

export function formatTimeWindow(from: string | null, to: string | null): string {
  if (!from || !to) return ''
  const toTime = new Date(to).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz })
  return `${formatDateTime(from)}–${toTime}`
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'nyss'
  if (s < 3600) return `${Math.floor(s / 60)} min sedan`
  if (s < 86400) return `${Math.floor(s / 3600)} tim sedan`
  const days = Math.floor(s / 86400)
  return days === 1 ? 'i går' : `${days} dagar sedan`
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null) return ''
  return `ca ${m} m bort`
}

interface Titled {
  category: string
  subcategory: string | null
  size_cm?: number | null
  shoe_size?: number | null
}

export function listingTitle(l: Titled): string {
  return l.subcategory || categoryById(l.category)?.label || 'Sak'
}

export function listingSize(l: Titled): string {
  const type = sizeTypeFor(l.category, l.subcategory)
  if (type === 'clothes' && l.size_cm) {
    const s = CLOTHING_SIZES.find((x) => x.cm === l.size_cm)
    return `Stl ${l.size_cm}${s ? ` · ${s.label}` : ''}`
  }
  if (type === 'shoes' && l.shoe_size) return `Stl ${l.shoe_size} (EU)`
  return ''
}

export function categoryEmoji(category: string): string {
  return categoryById(category)?.emoji ?? '🎁'
}
