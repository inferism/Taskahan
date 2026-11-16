import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

/**
 * Board interactive in under 3 seconds on throttled 4G (10.6): a mid-range phone profile, which
 * is a 390x844 viewport, 4x CPU slowdown and 1.6 Mbps down / 750 Kbps up with 150 ms of latency
 * (the "slow 4G" figures Lighthouse uses). The session is warm, as it is for a returning user,
 * and the HTTP cache is cold. "Interactive" means a task row is on screen and opens when tapped.
 */

const url = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const key = process.env.E2E_SUPABASE_KEY!
const PASSWORD = 'password123'
const BUDGET_MS = 3000

test('the board is interactive in under 3 seconds on throttled 4G', async ({ browser }) => {
  // A busy board: ana leads, ben holds twelve tasks.
  const api = async (u: string) => {
    const c = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await c.auth.signInWithPassword({
      email: `${u}@users.taskahan.pages.dev`,
      password: PASSWORD,
    })
    if (error) throw error
    return c
  }
  const [ana, ben] = [await api('ana'), await api('ben')]
  const code = Array.from({ length: 8 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join('')
  const created = await ana.rpc('create_group', {
    p_name: `Perf ${code}`,
    p_purpose: 'other',
    p_purpose_note: 'perf',
    p_member_limit: 4,
    p_join_code: code,
  })
  if (created.error) throw created.error
  const groupId = created.data as string
  expect((await ben.rpc('join_group', { p_join_code: code })).data).toBeTruthy()
  const snap = await ana.rpc('get_group_snapshot', { p_group_id: groupId })
  const benId = (
    snap.data as unknown as { memberships: { id: string; display_name: string }[] }
  ).memberships.find((m) => m.display_name === 'ben')!.id
  for (let i = 1; i <= 12; i++) {
    const t = await ana.rpc('create_task', {
      p_group_id: groupId,
      p_assignee_id: benId,
      p_title: `Perf task ${i}`,
      p_details: '',
      p_deadline: null as unknown as string,
    })
    if (t.error) throw t.error
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Username').fill('ben')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL('/')

  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.clearBrowserCache')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  const start = Date.now()
  await page.goto(`/g/${groupId}`, { waitUntil: 'commit' })
  const row = page.getByRole('button', { name: /Perf task 1\b/ })
  await row.click({ timeout: 15_000 })
  await expect(page.getByRole('group', { name: /^Task #\d+ details$/ }).first()).toBeVisible()
  const elapsed = Date.now() - start
  console.log(`board interactive in ${elapsed} ms (budget ${BUDGET_MS} ms)`)
  expect(elapsed).toBeLessThan(BUDGET_MS)

  await context.close()
})
