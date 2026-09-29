import { expect, test, type Page } from '@playwright/test'
import { login, newUser, onboard, shot } from './helpers'

const run = Date.now()
// En ny plats för varje körning (i västra Sverige), så att testet inte blandas ihop med tidigare körningar
const base = 57 + (run % 97) * 0.02
const HOME_A = { lat: base, lng: 12.5 }
const HOME_B = { lat: base + 0.0012, lng: 12.502 }

async function publish(page: Page, opts: { category: RegExp; sub: string; size?: string; brand?: string }) {
  await page.goto('/bjussa')
  await page.getByTestId('photo-input').setInputFiles('e2e/fixtures/leksak.jpg')
  await expect(page.getByAltText('Din bild')).toBeVisible()
  await page.getByRole('button', { name: opts.category }).click()
  await page.getByRole('button', { name: opts.sub }).click()
  if (opts.size) await page.getByLabel('Storlek').selectOption(opts.size)
  await page.getByRole('button', { name: /Använd men hel/ }).click()
  if (opts.brand) await page.getByLabel('Varumärke').fill(opts.brand)
  await page.getByRole('button', { name: 'Bjussa!' }).click()
  await expect(page.getByText('Tack! Din bjussning syns nu')).toBeVisible()
}

test('steg 2: barn och storlekar, filter, omdöme, statistik i förfrågan, rapportera', async ({ browser }) => {
  const a = await newUser(browser, HOME_A)
  await login(a, `gbg-anna+${run}@test.se`)
  await onboard(a, 'Anna', 'gps')
  await publish(a, { category: /Kläder/, sub: 'Byxor', size: '92', brand: 'Reima' })
  await publish(a, { category: /Kläder/, sub: 'Tröjor', size: '128' })
  await publish(a, { category: /Leksaker/, sub: 'Bygg och pussel' })

  const b = await newUser(browser, HOME_B)
  await login(b, `gbg-bertil+${run}@test.se`)
  await onboard(b, 'Bertil', 'gps')
  await expect(b.getByRole('link', { name: /Byxor/ })).toBeVisible()
  await expect(b.getByRole('link', { name: /Tröjor/ })).toBeVisible()

  // Lägg till ett barn som har storlek 92
  await b.getByRole('link', { name: /Lägg till barn/ }).click()
  await b.getByRole('button', { name: '+ Lägg till' }).click()
  await b.getByLabel('Smeknamn').fill('Elsa')
  const d = new Date()
  d.setMonth(d.getMonth() - 20)
  await b.getByLabel('Född (år och månad)').fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  await b.getByLabel('Klädstorlek nu').selectOption('92')
  await b.getByRole('button', { name: 'Spara' }).click()
  await expect(b.getByTestId('child')).toContainText('Nästa storlek, 98')
  await shot(b, '11-mina-barn')

  // "Passar mina barn" visar 92 och leksaken, inte 128
  await b.getByRole('link', { name: 'Flöde' }).click()
  await expect(b.getByRole('button', { name: /Passar mina barn/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(b.getByRole('link', { name: /Byxor/ })).toBeVisible()
  await expect(b.getByRole('link', { name: /Bygg och pussel/ })).toBeVisible()
  await expect(b.getByRole('link', { name: /Tröjor/ })).toHaveCount(0)
  await shot(b, '12-passar-mina-barn')

  // Slå av, filtrera på kategori och sök
  await b.getByRole('button', { name: /Passar mina barn/ }).click()
  await expect(b.getByRole('link', { name: /Tröjor/ })).toBeVisible()
  await b.getByRole('button', { name: /Leksaker/ }).click()
  await expect(b.getByRole('link', { name: /Bygg och pussel/ })).toBeVisible()
  await expect(b.getByRole('link', { name: /Tröjor/ })).toHaveCount(0)
  await b.getByRole('button', { name: /Leksaker/ }).click()
  await b.getByLabel('Sök').fill('reima')
  await expect(b.getByRole('link', { name: /Tröjor/ })).toHaveCount(0)
  await expect(b.getByRole('link', { name: /Byxor/ })).toBeVisible()
  await b.getByLabel('Sök').fill('')

  // Vill ha byxorna
  await b.getByRole('link', { name: /Byxor/ }).click()
  await b.getByRole('button', { name: /Vill ha/ }).click()
  await expect(b.getByText(/Du står i kö/)).toBeVisible()

  // Rapportera tröjan
  await b.goto('/')
  await b.getByRole('link', { name: /Tröjor/ }).click()
  await b.getByRole('button', { name: 'Mer' }).click()
  await b.getByRole('button', { name: /Rapportera annonsen/ }).click()
  await b.getByLabel('Säljs – är inte gratis').check()
  await b.getByRole('button', { name: 'Skicka rapport' }).click()
  await expect(b.getByText(/Tack! Vi tittar på det/)).toBeVisible()
  await b.getByRole('button', { name: 'Stäng' }).click()

  // Anna ser Bertils statistik i kön och godkänner
  await a.goto('/mina')
  const row = a.getByTestId('request-row').first()
  await expect(row).toContainText('Bertil')
  await expect(row.getByTestId('user-stats')).toContainText('Bjussat 0')
  await expect(row.getByTestId('user-stats')).toContainText('Ny på Bjuss')
  await shot(a, '13-ko-med-statistik')
  await row.getByRole('button', { name: 'Godkänn' }).click()
  await expect(a.getByRole('button', { name: 'Markera som hämtad' })).toBeVisible()

  // Bertil hämtar och lämnar omdöme
  await b.goto('/mina?flik=hamtningar')
  await b.getByRole('button', { name: /Jag har hämtat/ }).click()
  await expect(b.getByTestId('rating')).toBeVisible()
  await shot(b, '14-omdome')
  await b.getByRole('button', { name: /Stämde/ }).click()
  await expect(b.getByText('Ditt omdöme: 👍 Stämde med beskrivningen')).toBeVisible()
})
