import { expect, test } from '@playwright/test'
import { login, newUser, onboard, shot } from './helpers'

const run = Date.now()
const HOME = { lat: 60 + (run % 97) * 0.02, lng: 15.5 }

test('steg 3: bilbarnstolar spärras och säkerhetsprodukter får varning', async ({ browser }) => {
  const a = await newUser(browser, HOME)
  await login(a, `sak-anna+${run}@test.se`)
  await onboard(a, 'Anna', 'gps')

  await a.goto('/bjussa')
  await a.getByTestId('photo-input').setInputFiles('e2e/fixtures/leksak.jpg')
  await expect(a.getByAltText('Din bild')).toBeVisible()
  await a.getByRole('button', { name: /Utrustning/ }).click()
  await a.getByRole('button', { name: 'Matstol' }).click()
  await a.getByRole('button', { name: /Använd men hel/ }).click()

  // Matstol är en säkerhetsprodukt
  await expect(a.getByTestId('safety-warning')).toBeVisible()
  await expect(a.getByRole('button', { name: 'Bjussa!' })).toBeEnabled()

  // Bilbarnstol i texten spärrar
  await a.getByLabel('Något mer att veta?').fill('Följer med en bältesstol också')
  await expect(a.getByTestId('car-seat-block')).toBeVisible()
  await expect(a.getByRole('button', { name: 'Bjussa!' })).toBeDisabled()
  await shot(a, '16-bilbarnstol-spärrad')

  await a.getByLabel('Något mer att veta?').fill('')
  await a.getByLabel('Varumärke').fill('Britax babyskydd')
  await expect(a.getByTestId('car-seat-block')).toBeVisible()

  // Rättar man texten går det att bjussa igen
  await a.getByLabel('Varumärke').fill('Stokke')
  await expect(a.getByTestId('car-seat-block')).toHaveCount(0)
  await a.getByRole('button', { name: 'Bjussa!' }).click()
  await expect(a.getByText('Tack! Din bjussning syns nu')).toBeVisible()
  await expect(a.getByTestId('safety-warning')).toBeVisible()
})
