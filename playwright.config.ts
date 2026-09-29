// Automatiska webbläsartester mot den lokala mini-Supabasen.
// Starta först: bash scripts/local/start.sh   Kör sedan: npm run test:e2e
import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'

const anonKey = fs.existsSync('.local-stack/anon.key') ? fs.readFileSync('.local-stack/anon.key', 'utf8').trim() : ''

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Pixel 7'],
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    launchOptions: fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {},
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: anonKey,
      VITE_GEOCODER_URL: 'https://geo.test',
    },
  },
})
