import { execSync } from 'node:child_process'
import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests run the dev server against the local Supabase stack (`supabase start`, with
 * the seed applied). Locally the URL and key come from `supabase status`; CI passes them in.
 */
const url = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321'
function publishableKey(): string {
  if (process.env.E2E_SUPABASE_KEY) return process.env.E2E_SUPABASE_KEY
  const env = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const line = env.split('\n').find((l) => /^(PUBLISHABLE_KEY|ANON_KEY)=/.test(l))
  if (!line)
    throw new Error('Set E2E_SUPABASE_KEY, or start the local stack with `supabase start`.')
  return line.slice(line.indexOf('=') + 1).replace(/^"|"$/g, '')
}
const key = publishableKey()
process.env.E2E_SUPABASE_URL = url
process.env.E2E_SUPABASE_KEY = key

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      // No bot check against a local stack.
      VITE_TURNSTILE_SITE_KEY: '',
    },
  },
})
