import { expect, type Browser, type Page } from '@playwright/test'
import fs from 'node:fs'

export const SHOTS = 'test-results/screens'
fs.mkdirSync(SHOTS, { recursive: true })

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

/** Låtsas-OpenStreetMap: svarar med platser i Aspudden. */
export async function mockGeocoder(page: Page) {
  await page.route('https://geo.test/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/search') {
      return route.fulfill({
        json: [
          {
            lat: '59.30670',
            lon: '18.00130',
            address: { road: 'Aspuddsvägen', house_number: '1', suburb: 'Aspudden', city: 'Stockholm', postcode: '126 49' },
          },
        ],
      })
    }
    const lat = url.searchParams.get('lat')
    const lon = url.searchParams.get('lon')
    return route.fulfill({
      json: {
        lat,
        lon,
        address: {
          road: 'Hägerstensvägen',
          house_number: '2',
          suburb: 'Aspudden',
          quarter: 'Västberga',
          city_district: 'Hägersten-Liljeholmens stadsdelsområde',
          city: 'Stockholm',
          postcode: '126 50',
        },
      },
    })
  })
}

export async function newUser(browser: Browser, opts: { lat?: number; lng?: number } = {}) {
  const context = await browser.newContext({
    geolocation: opts.lat ? { latitude: opts.lat, longitude: opts.lng! } : undefined,
    permissions: opts.lat ? ['geolocation'] : [],
  })
  const page = await context.newPage()
  page.on('dialog', (d) => d.accept())
  await mockGeocoder(page)
  return page
}

async function latestCode(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`http://localhost:54321/__mail/latest?to=${encodeURIComponent(email)}`)
    if (res.ok) {
      const mail = (await res.json()) as { text: string; at: string }
      const code = mail.text.match(/\b(\d{6,10})\b/)?.[1]
      if (code && Date.now() - new Date(mail.at).getTime() < 30000) return code
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Inget mejl med kod kom fram')
}

export async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Din e-post').fill(email)
  await page.getByRole('button', { name: 'Skicka inloggningskod' }).click()
  await expect(page.getByLabel('Kod från mejlet')).toBeVisible()
  const code = await latestCode(email)
  await page.getByLabel('Kod från mejlet').fill(code)
  await page.getByRole('button', { name: 'Logga in' }).click()
}

export async function onboard(page: Page, name: string, mode: 'address' | 'gps') {
  await expect(page.getByText('Välkommen till Bjuss!')).toBeVisible()
  await page.getByLabel('Vad vill du kallas?').fill(name)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Fortsätt' }).click()
  await expect(page.getByText('Var bor du?')).toBeVisible()
  if (mode === 'address') {
    await page.getByLabel('Gatuadress').fill('Aspuddsvägen 1')
    await page.getByLabel('Postnummer').fill('126 49')
    await page.getByLabel('Ort').fill('Hägersten')
    await page.getByRole('button', { name: /Hitta mitt område/ }).click()
  } else {
    await page.getByRole('button', { name: /Använd min plats/ }).click()
  }
  await expect(page.getByRole('button', { name: 'Aspudden' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Klart/ }).click()
}
