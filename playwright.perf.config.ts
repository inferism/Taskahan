import { execSync } from 'node:child_process'
import { defineConfig } from '@playwright/test'

/**
 * Performance check (10.6) against the production build, served with gzip like Cloudflare Pages.
 * `npm run test:perf` builds against the local stack (`supabase start`) and runs e2e/perf.
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
  testDir: 'e2e/perf',
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && node e2e/perf/serve.mjs 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      // No bot check against a local stack.
      VITE_TURNSTILE_SITE_KEY: '',
    },
  },
})
