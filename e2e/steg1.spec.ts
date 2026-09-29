import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { login, newUser, onboard, shot } from './helpers'

const run = Date.now()
const anna = `anna+${run}@test.se`
const bertil = `bertil+${run}@test.se`

test('steg 1: bjussa, se i flödet, chatta, vill ha, godkänn, hämta', async ({ browser }) => {
  // ---------- Anna skapar konto och bjussar ----------
  const a = await newUser(browser)
  await login(a, anna)
  await shot(a, '01-onboarding')
  await onboard(a, 'Anna', 'address')
  await expect(a.getByText('Inget att hämta just nu')).toBeVisible()
  await shot(a, '02-tomt-flode')

  await a.goto('/bjussa')
  await a.getByTestId('photo-input').setInputFiles('e2e/fixtures/overall.jpg')
  await expect(a.getByAltText('Din bild')).toBeVisible()
  await a.getByRole('button', { name: /Kläder/ }).click()
  await a.getByRole('button', { name: 'Overaller och ytterkläder' }).click()
  await a.getByLabel('Storlek').selectOption('92')
  await a.getByRole('button', { name: /Som ny/ }).click()
  await a.getByRole('button', { name: 'Fler' }).click()
  await a.getByLabel('Varumärke').fill('Polarn O. Pyret')
  await a.getByLabel('Portkod').fill('4321')
  await a.getByLabel('Instruktion').fill('3 tr, kassen hänger på dörren')
  await shot(a, '03-bjussa-formular')
  await a.getByRole('button', { name: 'Bjussa!' }).click()
  await expect(a.getByText('Tack! Din bjussning syns nu')).toBeVisible()
  await shot(a, '04-annons-skapad')

  // Bilden ska vara rensad från EXIF/GPS
  const uploaded = fs
    .readdirSync('.local-stack/storage/listing-photos', { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.jpg'))
  expect(uploaded.length).toBeGreaterThanOrEqual(2)
  for (const f of uploaded) {
    const bytes = fs.readFileSync(path.join('.local-stack/storage/listing-photos', f))
    expect(bytes.includes(Buffer.from('Exif')), `${f} ska sakna EXIF`).toBe(false)
    expect(bytes.includes(Buffer.from('SecretPhone')), `${f} ska sakna kameramodell`).toBe(false)
  }

  // ---------- Bertil, granne ca 300 m bort ----------
  const b = await newUser(browser, { lat: 59.308, lng: 18.005 })
  await login(b, bertil)
  await onboard(b, 'Bertil', 'gps')
  const card = b.getByRole('link', { name: /Overaller och ytterkläder/ })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Aspudden')
  await expect(card).toContainText(/ca \d00 m bort/)
  await expect(card).toContainText('Stl 92')
  await shot(b, '05-flode-granne')

  await card.click()
  await expect(b.getByRole('button', { name: /Vill ha/ })).toBeVisible()
  await expect(b.getByText('4321')).toHaveCount(0)
  await shot(b, '06-annonssida')

  // Fråga bjussaren
  await b.getByRole('button', { name: /Fråga bjussaren/ }).click()
  await expect(b.getByRole('heading', { name: 'Anna' })).toBeVisible()
  await b.getByLabel('Meddelande').fill('Hej! Är overallen hel?')
  await b.getByRole('button', { name: 'Skicka' }).click()
  await expect(b.getByTestId('messages')).toContainText('Är overallen hel?')
  await b.getByRole('button', { name: /Vill ha/ }).click()
  await expect(b.getByTestId('messages')).toContainText('vill ha den här')
  await expect(b.getByText('Du står i kö')).toBeVisible()
  await shot(b, '07-chatt-mottagare')

  // ---------- Anna svarar och godkänner ----------
  await a.goto('/chatt')
  const conv = a.getByRole('link', { name: /Bertil/ })
  await expect(conv).toBeVisible()
  await expect(a.getByLabel('Oläst')).toBeVisible()
  await conv.click()
  await expect(a.getByTestId('messages')).toContainText('Är overallen hel?')
  await a.getByLabel('Meddelande').fill('Ja, helt hel! Ring 070-123 45 67 om något.')
  await a.getByRole('button', { name: 'Skicka' }).click()
  await a.getByRole('button', { name: 'Godkänn Bertil' }).click()
  await expect(a.getByTestId('messages')).toContainText('har godkänt förfrågan')
  await shot(a, '08-chatt-givare-godkant')

  // ---------- Bertil ser adressen och hämtar ----------
  await b.goto('/mina?flik=hamtningar')
  const pickup = b.getByTestId('pickup-card')
  await expect(pickup).toContainText('Aspuddsvägen 1')
  await expect(pickup).toContainText('4321')
  await expect(pickup).toContainText('kassen hänger på dörren')
  await shot(b, '09-hamtningsinfo')
  await b.getByRole('button', { name: /Jag har hämtat/ }).click()
  await expect(b.getByText('Hämtad', { exact: true })).toBeVisible()
  await expect(b.getByTestId('pickup-card')).toHaveCount(0)

  // ---------- Anna ser att det är hämtat ----------
  await a.goto('/mina')
  await expect(a.getByText('Hämtad', { exact: true })).toBeVisible()
  await shot(a, '10-mina-bjussningar')
})
