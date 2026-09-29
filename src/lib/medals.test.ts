import { describe, expect, it } from 'vitest'
import { MEDALS, earnedMedals, nextMedal } from './medals'

describe('medaljer', () => {
  it('finns för 5, 10, 25, 50, 100, 250 och 500', () => {
    expect(MEDALS.map((m) => m.at)).toEqual([5, 10, 25, 50, 100, 250, 500])
  })
  it('räknar ut intjänade och nästa', () => {
    expect(earnedMedals(4)).toHaveLength(0)
    expect(earnedMedals(12).map((m) => m.at)).toEqual([5, 10])
    expect(nextMedal(12)?.at).toBe(25)
    expect(nextMedal(600)).toBeNull()
  })
})
