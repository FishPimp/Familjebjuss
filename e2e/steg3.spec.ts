import { expect, test, type Page } from '@playwright/test'
import { login, newUser, onboard, shot } from './helpers'

const run = Date.now()
const HOME = { lat: 60 + (run % 97) * 0.02, lng: 15.5 }

const base = {
  category: 'clothes',
  subcategory: 'Tröjor',
  size_cm: 98,
  shoe_size: null,
  quantity: 3,
  condition: 'used_intact',
  brand: 'Lindex',
  description: 'Tre randiga tröjor i blått och vitt.',
  contains_car_seat: false,
  contains_child: false,
  safety_product: false,
  confidence: 'high',
}

async function mockClaude(suggestion: object) {
  await fetch('http://localhost:54321/__anthropic/next', { method: 'POST', body: JSON.stringify(suggestion) })
}

async function upload(page: Page) {
  await page.goto('/bjussa')
  await page.getByTestId('photo-input').setInputFiles('e2e/fixtures/leksak.jpg')
  await expect(page.getByAltText('Din bild')).toBeVisible()
}

test('steg 3: bildtolkning förifyller, bilbarnstolar spärras, varning för barn och säkerhetsprodukter', async ({ browser }) => {
  const a = await newUser(browser, HOME)
  await login(a, `ai-anna+${run}@test.se`)
  await onboard(a, 'Anna', 'gps')

  // Förifyllning
  await mockClaude(base)
  await upload(a)
  await expect(a.getByTestId('ai-status')).toContainText('Förifyllt')
  await expect(a.getByRole('button', { name: /Kläder/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(a.getByRole('button', { name: 'Tröjor' })).toHaveAttribute('aria-pressed', 'true')
  await expect(a.getByLabel('Storlek')).toHaveValue('98')
  await expect(a.getByRole('button', { name: /Använd men hel/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(a.getByTestId('quantity')).toHaveText('3')
  await expect(a.getByLabel('Varumärke')).toHaveValue('Lindex')
  await shot(a, '15-ai-forifyllt')
  await a.getByRole('button', { name: 'Bjussa!' }).click()
  await expect(a.getByText('Tack! Din bjussning syns nu')).toBeVisible()
  await expect(a.getByText('Stl 98')).toBeVisible()

  // Bilbarnstol på bilden
  await mockClaude({ ...base, category: 'gear', subcategory: null, size_cm: null, contains_car_seat: true, description: 'Ett babyskydd.' })
  await upload(a)
  await expect(a.getByTestId('car-seat-block')).toBeVisible()
  await expect(a.getByRole('button', { name: 'Bjussa!' })).toBeDisabled()
  await shot(a, '16-bilbarnstol-spärrad')

  // Bilbarnstol i texten
  await mockClaude({ ...base, category: 'gear', subcategory: 'Matstol', size_cm: null })
  await upload(a)
  await expect(a.getByTestId('car-seat-block')).toHaveCount(0)
  await a.getByLabel('Något mer att veta?').fill('Följer med en bältesstol också')
  await expect(a.getByTestId('car-seat-block')).toBeVisible()
  await expect(a.getByRole('button', { name: 'Bjussa!' })).toBeDisabled()
  await a.getByLabel('Något mer att veta?').fill('Matstol i trä')
  await expect(a.getByTestId('car-seat-block')).toHaveCount(0)
  // Matstol är en säkerhetsprodukt
  await expect(a.getByTestId('safety-warning')).toBeVisible()

  // Barn på bilden
  await mockClaude({ ...base, contains_child: true })
  await upload(a)
  await expect(a.getByTestId('child-warning')).toBeVisible()
  await expect(a.getByRole('button', { name: 'Bjussa!' })).toBeDisabled()
  await shot(a, '17-barn-pa-bilden')
  await a.getByRole('button', { name: 'Det är inget barn på bilden' }).click()
  await expect(a.getByTestId('child-warning')).toHaveCount(0)
  await expect(a.getByRole('button', { name: 'Bjussa!' })).toBeEnabled()

  // Rätt anrop till Claude
  const last = (await (await fetch('http://localhost:54321/__anthropic/last')).json()) as {
    headers: Record<string, string>
    body: { model: string; fallbacks: string; output_config: { effort: string; format: { type: string } } }
  }
  expect(last.body.model).toBe('claude-opus-5-5')
  expect(last.body.fallbacks).toBe('default')
  expect(last.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01')
  expect(last.body.output_config.format.type).toBe('json_schema')
})
