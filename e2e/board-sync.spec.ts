import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * Two browsers on one board (5.6). Each test builds its own group through the real functions as
 * the seeded accounts ana and ben (password "password123"), so nothing depends on test order or
 * on a database reset. ana leads; ben holds one task.
 */

const url = process.env.E2E_SUPABASE_URL!
const key = process.env.E2E_SUPABASE_KEY!
const PASSWORD = 'password123'

async function api(username: string): Promise<SupabaseClient> {
  const client = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({
    email: `${username}@users.taskahan.pages.dev`,
    password: PASSWORD,
  })
  if (error) throw error
  return client
}

const randomCode = () =>
  Array.from({ length: 8 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')

interface Fixture {
  groupId: string
  name: string
  benMemberId: string
  ana: SupabaseClient
}

async function makeGroup(): Promise<Fixture> {
  const [ana, ben] = [await api('ana'), await api('ben')]
  const name = `E2E ${randomCode()}`
  const code = randomCode()
  const created = await ana.rpc('create_group', {
    p_name: name,
    p_purpose: 'other',
    p_purpose_note: 'end to end',
    p_member_limit: 4,
    p_join_code: code,
  })
  if (created.error) throw created.error
  const groupId = created.data as string
  const joined = await ben.rpc('join_group', { p_join_code: code })
  if (joined.error) throw joined.error
  const snap = await ana.rpc('get_group_snapshot', { p_group_id: groupId })
  const members = (snap.data as unknown as { memberships: { id: string; display_name: string }[] })
    .memberships
  const benMemberId = members.find((m) => m.display_name === 'ben')!.id
  const task = await ana.rpc('create_task', {
    p_group_id: groupId,
    p_assignee_id: benMemberId,
    p_title: 'Write the report',
    p_details: '',
    p_deadline: null as unknown as string,
  })
  if (task.error) throw task.error
  return { groupId, name, benMemberId, ana }
}

/** A browser of its own, signed in through the real login form, with the board open. */
async function openBoard(browser: Browser, username: string, groupId: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL('/')
  await page.goto(`/g/${groupId}`)
  await expect(page.getByRole('region', { name: `${username}'s tasks` })).toBeVisible()
  return { context, page }
}

const online = (page: Page, n: number) =>
  expect(page.getByText(`${n} online`)).toBeVisible({ timeout: 10_000 })

test.describe('two browsers on one board', () => {
  let fx: Fixture
  let ana: { context: BrowserContext; page: Page }
  let ben: { context: BrowserContext; page: Page }

  test.beforeEach(async ({ browser }) => {
    fx = await makeGroup()
    ana = await openBoard(browser, 'ana', fx.groupId)
    ben = await openBoard(browser, 'ben', fx.groupId)
  })
  test.afterEach(async () => {
    await ana.context.close().catch(() => undefined)
    await ben.context.close().catch(() => undefined)
  })

  test('a status change in one browser shows up in the other', async () => {
    const mine = ben.page.getByRole('region', { name: "ben's tasks" })
    await mine.getByRole('button', { name: /Write the report/ }).click()
    await mine.getByRole('radio', { name: 'Done' }).click()
    // The guess is instant for ben; ana learns of it through the realtime change.
    await expect(mine.getByRole('button', { name: /Done · 1/ })).toBeVisible()
    await expect(ana.page.getByText('1 of 1 completed').first()).toBeVisible({ timeout: 10_000 })
  })

  // The chat panel arrives with 6.2; until then a message has nowhere to show.
  test.fixme('a chat message sent by one browser appears in the other', () => {})

  test('presence: one tab closing keeps a member online, the last one flips them offline', async () => {
    await online(ana.page, 2)
    const second = await ben.context.newPage()
    await second.goto(`/g/${fx.groupId}`)
    await expect(second.getByRole('region', { name: "ben's tasks" })).toBeVisible()
    await ben.page.close()
    await online(ana.page, 2)
    await second.close()
    await online(ana.page, 1)
  })

  test('a removed member is taken out of the open board', async () => {
    const removed = await fx.ana.rpc('remove_member', { p_member_id: fx.benMemberId })
    expect(removed.error).toBeNull()
    await expect(ben.page.getByText(`You were removed from ${fx.name}.`)).toBeVisible({
      timeout: 10_000,
    })
    await expect(ben.page).toHaveURL('/')
  })
})
