import { describe, expect, it } from 'vitest'
import { ageInMonths, describeNext, fittingSizes, sizeForAge, sizeInfo, type Child } from './sizes'

const now = new Date('2026-09-15T12:00:00')
const child = (birth: string, cm: number | null = null, shoe: number | null = null): Child => ({
  id: 'x',
  nickname: null,
  birth_month: birth,
  clothes_size_cm: cm,
  shoe_size: shoe,
})

describe('storleksberäkning', () => {
  it('räknar ålder i månader', () => {
    expect(ageInMonths('2025-09-01', now)).toBe(12)
    expect(ageInMonths('2026-09-01', now)).toBe(0)
  })

  it('ger typisk storlek för ålder', () => {
    expect(sizeForAge(0)).toBe(50)
    expect(sizeForAge(3)).toBe(62)
    expect(sizeForAge(20)).toBe(92)
    expect(sizeForAge(30)).toBe(98)
    expect(sizeForAge(500)).toBe(170)
  })

  it('uppskattar nästa storlek från ålder', () => {
    const info = sizeInfo(child('2025-03-01'), now) // 18 månader
    expect(info.currentCm).toBe(92)
    expect(info.nextCm).toBe(98)
    expect(info.monthsUntilNext).toBe(6)
    expect(info.fromParent).toBe(false)
  })

  it('använder förälderns angivna storlek', () => {
    const info = sizeInfo(child('2025-03-01', 98), now)
    expect(info.currentCm).toBe(98)
    expect(info.nextCm).toBe(104)
    expect(info.fromParent).toBe(true)
    expect(describeNext(info)).toContain('Nästa storlek, 104')
  })

  it('räknar ut skor', () => {
    const info = sizeInfo(child('2024-03-01', null, 24), now)
    expect(info.nextShoe).toBe(25)
    expect(info.monthsUntilNextShoe).toBe(3)
  })

  it('samlar storlekar som passar alla barn', () => {
    const sizes = fittingSizes([child('2025-03-01'), child('2021-09-01', 116, 30)], now)
    expect(sizes.cm).toEqual([92, 98, 116, 122])
    expect(sizes.shoes).toEqual([30, 31])
  })
})
