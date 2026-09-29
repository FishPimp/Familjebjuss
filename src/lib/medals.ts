// Medaljer för bjussningar. Namnen är förslag – ändra fritt här.
export interface Medal {
  at: number
  name: string
  emoji: string
  text: string
}

export const MEDALS: Medal[] = [
  { at: 5, name: 'Första kassen', emoji: '🛍️', text: 'Fem saker har fått nytt liv hos grannar.' },
  { at: 10, name: 'Dörrhjälte', emoji: '🚪', text: 'Tio kassar har hängt på din dörr.' },
  { at: 25, name: 'Trapp\u00ADuppgångens ängel', emoji: '😇', text: 'Tjugofem bjussningar – grannarna tackar.' },
  { at: 50, name: 'Guldgranne', emoji: '🥇', text: 'Femtio! Du gör kvarteret bättre.' },
  { at: 100, name: 'Hundra hjärtan', emoji: '💛', text: 'Hundra bjussningar. Wow.' },
  { at: 250, name: 'Bjuss\u00ADmästare', emoji: '👑', text: 'Tvåhundrafemtio – en sann mästare.' },
  { at: 500, name: 'Kvarters\u00ADlegend', emoji: '🏆', text: 'Femhundra bjussningar. Legendariskt.' },
]

export function earnedMedals(points: number): Medal[] {
  return MEDALS.filter((m) => points >= m.at)
}

export function nextMedal(points: number): Medal | null {
  return MEDALS.find((m) => points < m.at) ?? null
}
