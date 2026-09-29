import { expect, test, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { login, newUser, onboard, shot } from './helpers'

const run = Date.now()
const base = 61 + (run % 97) * 0.02
const HOME_A = { lat: base, lng: 16.5 }
const HOME_B = { lat: base + 0.001, lng: 16.502 }

function sql(q: string) {
  execSync(`psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -qAt -c "${q}"`, { env: { ...process.env, PGPASSWORD: 'postgres' } })
}

async function publish(page: Page, sub: string) {
  await fetch('http://localhost:54321/__anthropic/next', {
    method: 'POST',
    body: JSON.stringify({
      category: 'toys', subcategory: sub, size_cm: null, shoe_size: null, quantity: 1, condition: 'like_new',
      brand: null, description: '', contains_car_seat: false, contains_child: false, safety_product: false, confidence: 'high',
    }),
  })
  await page.goto('/bjussa')
  await page.getByTestId('photo-input').setInputFiles('e2e/fixtures/leksak.jpg')
  await expect(page.getByTestId('ai-status')).toContainText('Förifyllt')
  await page.getByRole('button', { name: 'Bjussa!' }).click()
  await expect(page.getByText('Tack! Din bjussning syns nu')).toBeVisible()
}

test('steg 4: statistik, medaljer, öppen profil och hämtningsgräns', async ({ browser }) => {
  sql('update public.app_settings set free_pickups = 0, monthly_pickup_limit = 1, pickup_notice_at = 0')
  try {
    const a = await newUser(browser, HOME_A)
    await login(a, `stat-anna+${run}@test.se`)
    await onboard(a, 'Anna', 'gps')
    await publish(a, 'Bebis')
    await publish(a, 'Utklädning')

    const b = await newUser(browser, HOME_B)
    await login(b, `stat-bertil+${run}@test.se`)
    await onboard(b, 'Bertil', 'gps')

    // Hämtningsnotis vid "nästan full" (inställd på 0 här)
    await b.getByRole('link', { name: /Bebis/ }).click()
    await expect(b.getByTestId('limit-notice')).toContainText('0 av 1')
    await b.getByRole('button', { name: /Vill ha/ }).click()
    await expect(b.getByText(/Du står i kö/)).toBeVisible()

    // Öppen profil för givaren
    await b.getByRole('link', { name: 'Anna' }).click()
    await expect(b.getByTestId('stats-card')).toContainText('0')
    await expect(b.getByText('med sedan')).toBeVisible()

    // Anna godkänner, Bertil hämtar
    await a.goto('/mina')
    await a.getByTestId('request-row').getByRole('button', { name: 'Godkänn' }).click()
    await b.goto('/mina?flik=hamtningar')
    await b.getByRole('button', { name: /Jag har hämtat/ }).click()
    await expect(b.getByTestId('rating')).toBeVisible()

    // Nu är gränsen nådd: mjuk puff i stället för "Vill ha"
    await b.goto('/')
    await b.getByRole('link', { name: /Utklädning/ }).click()
    await expect(b.getByTestId('limit-nudge')).toContainText('Har du något att skicka vidare?')
    await expect(b.getByRole('button', { name: /Vill ha/ })).toHaveCount(0)
    await shot(b, '18-hamtningsgrans')

    // Annas statistik
    await a.goto('/profil')
    const stats = a.getByTestId('stats-card')
    await expect(stats).toContainText('1')
    await expect(stats).toContainText('bjussningar')
    await expect(a.getByText(/4 bjussningar kvar till 🛍️ Första kassen/)).toBeVisible()
    await shot(a, '19-profil-statistik')
  } finally {
    sql('update public.app_settings set free_pickups = 10, monthly_pickup_limit = 5, pickup_notice_at = 4')
  }
})
