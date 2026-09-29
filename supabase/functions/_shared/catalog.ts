// Kategorier och storlekar som bildtolkningen får välja mellan.
// Måste stämma med src/config.ts – ett test (src/lib/catalog.test.ts) kontrollerar det.

export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  clothes: [
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
  shoes: ['Gummistövlar', 'Kängor och vinterskor', 'Sneakers', 'Sandaler', 'Innetofflor'],
  gear: ['Barnvagn', 'Bärsele', 'Skötbord', 'Matstol', 'Säng', 'Babysitter'],
  toys: ['Bebis', 'Bygg och pussel', 'Utklädning', 'Utomhus'],
  books_games: ['Böcker', 'Spel'],
  bikes_sports: ['Cyklar', 'Skridskor', 'Skidor'],
}

export const CLOTHING_SIZES_CM = [44, 50, 56, 62, 68, 74, 80, 86, 92, 98, 104, 110, 116, 122, 128, 134, 140, 146, 152, 158, 164, 170]

export const CONDITIONS = ['like_new', 'used_intact', 'stained_ok']
