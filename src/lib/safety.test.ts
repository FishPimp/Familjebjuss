import { describe, expect, it } from 'vitest'
import { isSafetyProduct, mentionsCarSeat } from '../config'

describe('bilbarnstolar', () => {
  it('känner igen vanliga ord', () => {
    for (const t of ['Bilbarnstol Britax', 'babyskydd', 'Bältesstol 15-36 kg', 'bilstol med isofix', 'Car seat', 'BILBARNSSTOL'])
      expect(mentionsCarSeat(t), t).toBe(true)
  })
  it('släpper igenom vanliga saker', () => {
    for (const t of ['Matstol i trä', 'Barnvagn', 'Pussel 24 bitar', 'Stol till dockskåp', null]) expect(mentionsCarSeat(t)).toBe(false)
  })
})

describe('säkerhetsprodukter', () => {
  it('varnar för sängar, selar och hjälmar', () => {
    expect(isSafetyProduct({ subcategory: 'Säng' })).toBe(true)
    expect(isSafetyProduct({ subcategory: 'Cyklar', description: 'Med cykelhjälm' })).toBe(true)
    expect(isSafetyProduct({ description: 'Bärsele från Babybjörn' })).toBe(true)
  })
  it('varnar inte för vanliga kläder', () => {
    expect(isSafetyProduct({ subcategory: 'Tröjor', description: 'Randig' })).toBe(false)
  })
})
