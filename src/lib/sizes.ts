// Räknar ut vilken storlek ett barn har nu och när nästa storlek behövs.
import { CLOTHING_SIZES, SHOE_SIZES } from '../config'

export interface Child {
  id: string
  nickname: string | null
  birth_month: string // "YYYY-MM-01"
  clothes_size_cm: number | null
  shoe_size: number | null
}

export function ageInMonths(birthMonth: string, now = new Date()): number {
  const [y, m] = birthMonth.split('-').map(Number)
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)
}

export function formatAge(months: number): string {
  if (months < 0) return 'inte född än'
  if (months < 24) return `${months} mån`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest ? `${years} år ${rest} mån` : `${years} år`
}

/** Typisk klädstorlek för en ålder */
export function sizeForAge(months: number): number {
  const hit = CLOTHING_SIZES.find((s) => months >= s.fromMonths && months < s.toMonths)
  if (hit) return hit.cm
  return months < 0 ? CLOTHING_SIZES[0].cm : CLOTHING_SIZES[CLOTHING_SIZES.length - 1].cm
}

export interface SizeInfo {
  ageMonths: number
  currentCm: number
  /** Storleken man angett själv, annars uppskattad från åldern */
  fromParent: boolean
  nextCm: number | null
  /** Ungefär hur många månader tills nästa storlek behövs (0 = redan nu) */
  monthsUntilNext: number | null
  shoe: number | null
  nextShoe: number | null
  monthsUntilNextShoe: number | null
}

export function sizeInfo(child: Child, now = new Date()): SizeInfo {
  const age = ageInMonths(child.birth_month, now)
  const currentCm = child.clothes_size_cm ?? sizeForAge(age)
  const idx = CLOTHING_SIZES.findIndex((s) => s.cm === currentCm)
  const next = idx >= 0 ? CLOTHING_SIZES[idx + 1] : undefined
  const current = idx >= 0 ? CLOTHING_SIZES[idx] : undefined
  let monthsUntilNext: number | null = null
  if (next && current) {
    // Om barnet är större än åldern antyder, räkna från storlekens egen tidslinje
    const aheadBy = Math.max(0, age - current.fromMonths)
    const span = current.toMonths - current.fromMonths
    monthsUntilNext = Math.max(0, Math.round(span - Math.min(aheadBy, span)))
    if (!child.clothes_size_cm) monthsUntilNext = Math.max(0, next.fromMonths - age)
  }

  const shoe = child.shoe_size
  const nextShoe = shoe && SHOE_SIZES.includes(shoe + 1) ? shoe + 1 : null
  // Små fötter växer ungefär en storlek var 3:e månad, större ungefär var 6:e
  const monthsUntilNextShoe = shoe ? (age < 36 ? 3 : 6) : null

  return {
    ageMonths: age,
    currentCm,
    fromParent: !!child.clothes_size_cm,
    nextCm: next?.cm ?? null,
    monthsUntilNext,
    shoe,
    nextShoe,
    monthsUntilNextShoe,
  }
}

/** Storlekar som "passar mina barn": nuvarande och nästa storlek för alla barn */
export function fittingSizes(children: Child[], now = new Date()): { cm: number[]; shoes: number[] } {
  const cm = new Set<number>()
  const shoes = new Set<number>()
  for (const c of children) {
    const info = sizeInfo(c, now)
    cm.add(info.currentCm)
    if (info.nextCm) cm.add(info.nextCm)
    if (info.shoe) shoes.add(info.shoe)
    if (info.nextShoe) shoes.add(info.nextShoe)
  }
  return { cm: [...cm].sort((a, b) => a - b), shoes: [...shoes].sort((a, b) => a - b) }
}

export function describeNext(info: SizeInfo): string {
  if (!info.nextCm) return `Använder storlek ${info.currentCm}.`
  const when =
    info.monthsUntilNext === 0 ? 'snart eller redan nu' : info.monthsUntilNext === 1 ? 'om ungefär en månad' : `om ungefär ${info.monthsUntilNext} månader`
  return `Använder ${info.currentCm}${info.fromParent ? '' : ' (uppskattat)'}. Nästa storlek, ${info.nextCm}, behövs ${when}.`
}
