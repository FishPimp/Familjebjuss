import { describe, expect, it } from 'vitest'
import { CATEGORIES, CLOTHING_SIZES, CONDITIONS, mentionsCarSeat } from '../config'
import * as fn from '../../supabase/functions/_shared/catalog'

describe('bildtolkningens katalog', () => {
  it('har samma kategorier och underkategorier som appen', () => {
    expect(Object.keys(fn.CATEGORY_SUBCATEGORIES).sort()).toEqual(CATEGORIES.map((c) => c.id).sort())
    for (const c of CATEGORIES) expect(fn.CATEGORY_SUBCATEGORIES[c.id]).toEqual(c.subcategories)
  })
  it('har samma storlekar och skick', () => {
    expect(fn.CLOTHING_SIZES_CM).toEqual(CLOTHING_SIZES.map((s) => s.cm))
    expect(fn.CONDITIONS).toEqual(CONDITIONS.map((c) => c.id))
  })
})

describe('bilbarnstolar', () => {
  it('känner igen vanliga ord', () => {
    for (const t of ['Bilbarnstol Britax', 'babyskydd', 'Bältesstol 15-36 kg', 'bilstol med isofix', 'Car seat', 'BILBARNSSTOL'])
      expect(mentionsCarSeat(t), t).toBe(true)
  })
  it('släpper igenom vanliga saker', () => {
    for (const t of ['Matstol i trä', 'Barnvagn', 'Pussel 24 bitar', 'Stol till dockskåp', null]) expect(mentionsCarSeat(t)).toBe(false)
  })
})
