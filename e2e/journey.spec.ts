import { createClient } from '@supabase/supabase-js'
import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * One full round through the real UI (10.5): sign up, create, join, assign, question, resolve,
 * done, remove, rejoin (refused), take over, transfer. The accounts are new on every run, so the
 * test needs no database reset.
 */

const url = process.env.E2E_SUPABASE_URL!
const key = process.env.E2E_SUPABASE_KEY!
const PASSWORD = 'password123'

const rand = (n: number) =>
  Array.from(
    { length: n },
    () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)],
  ).join('')

async function signUp(browser: Browser, username: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto('/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/')
  return { context, page }
}

async function joinWith(page: Page, code: string) {
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Join a group' })
  await dialog.getByLabel('Join code').fill(code)
  await dialog.getByRole('button', { name: 'Join group' }).click()
  return dialog
}

test('a whole round: sign up to transfer', async ({ browser }) => {
  const leaderName = `lead_${rand(6)}`
  const memberName = `memb_${rand(6)}`
  const groupName = `Round ${rand(5)}`
  const leader = await signUp(browser, leaderName)
  const member = await signUp(browser, memberName)
  const L = leader.page
  const M = member.page

  // Create a group as the leader.
  await L.getByRole('button', { name: 'Create', exact: true }).click()
  const create = L.getByRole('dialog', { name: 'Create a group' })
  await create.getByLabel('Group name').fill(groupName)
  await create.getByRole('button', { name: 'Suggest a code' }).click()
  await create.getByRole('button', { name: 'Create group' }).click()
  await L.waitForURL(/\/g\//)
  const groupUrl = L.url()
  const copy = L.getByRole('button', { name: /^Copy join code / })
  const code = (await copy.getAttribute('aria-label'))!.replace('Copy join code ', '')
  expect(code).toMatch(/^[A-Z]{8}$/)

  // The member joins with the code.
  await joinWith(M, code)
  await M.waitForURL(/\/g\//)
  await expect(M.getByRole('region', { name: `${memberName}'s tasks` })).toBeVisible()

  // The leader assigns a task.
  await L.getByRole('button', { name: 'Add task' }).click()
  const add = L.getByRole('dialog', { name: 'Add a task' })
  await add.getByLabel('Title').fill('Write the report')
  await add.getByRole('combobox', { name: 'Assignee' }).click()
  await L.getByRole('option', { name: new RegExp(memberName) }).click()
  await add.getByRole('button', { name: 'Add task' }).click()
  const theirs = M.getByRole('region', { name: `${memberName}'s tasks` })
  await expect(theirs.getByRole('button', { name: /Write the report/ })).toBeVisible({
    timeout: 10_000,
  })

  // The member asks a question; the leader replies; the member resolves it.
  await theirs.getByRole('button', { name: /Write the report/ }).click()
  await theirs.getByRole('button', { name: 'Ask a question' }).click()
  await theirs.getByLabel('Your question').fill('Which quarter?')
  await theirs.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(theirs.getByText('Which quarter?')).toBeVisible()

  const leadersView = L.getByRole('region', { name: `${memberName}'s tasks` })
  await leadersView.getByRole('button', { name: /Write the report/ }).click()
  await leadersView.getByLabel('Reply').fill('The third one.')
  await leadersView.getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(theirs.getByText('The third one.')).toBeVisible({ timeout: 10_000 })
  await theirs.getByRole('button', { name: 'Mark resolved' }).click()
  await expect(theirs.getByText(/Resolved by/)).toBeVisible()

  // The member marks it done; the leader sees the tally move.
  await theirs.getByRole('radio', { name: 'Done' }).click()
  await expect(L.getByText('1 of 1 completed').first()).toBeVisible({ timeout: 10_000 })

  // The leader removes the member, who is told and cannot come back with the code.
  await L.getByRole('button', { name: `Manage ${memberName}` }).click()
  await L.getByRole('menuitem', { name: /Remove from group/ }).click()
  // Keep the old code alive, so only the account block can refuse the rejoin.
  const removal = L.getByRole('dialog', { name: `Remove ${memberName}?` })
  await removal.getByRole('checkbox').uncheck()
  await removal.getByRole('button', { name: 'Remove member' }).click()
  await expect(M.getByText(`You were removed from ${groupName}.`)).toBeVisible({
    timeout: 10_000,
  })
  await expect(M).toHaveURL('/')
  await joinWith(M, code)
  await expect(M.getByText('That code did not work.')).toBeVisible()

  // The leader takes over the former member's tasks (the finished one is left alone, so tick it).
  const former = L.getByRole('region', { name: `${memberName}'s tasks` })
  await expect(former.getByText('Former member').first()).toBeVisible()
  await former.getByRole('button', { name: 'Take over tasks' }).click()
  const takeOver = L.getByRole('dialog', { name: /Take over tasks from/ })
  await takeOver.getByRole('checkbox').first().check()
  await takeOver.getByRole('button', { name: /^Take over \d+ task/ }).click()
  await expect(L.getByRole('region', { name: `${leaderName}'s tasks` })).toContainText(
    'Write the report',
    { timeout: 10_000 },
  )

  // A seeded account joins, and the leader hands leadership over.
  const ben = createClient(url, key, { auth: { persistSession: false } })
  const signedIn = await ben.auth.signInWithPassword({
    email: 'ben@users.taskahan.pages.dev',
    password: PASSWORD,
  })
  expect(signedIn.error).toBeNull()
  const joined = await ben.rpc('join_group', { p_join_code: code })
  expect(joined.error).toBeNull()
  expect(joined.data, 'ben joined').toBeTruthy()
  await L.goto(groupUrl)
  await L.getByRole('button', { name: 'Manage ben' }).click()
  await L.getByRole('menuitem', { name: /Make Leader/ }).click()
  await L.getByRole('button', { name: 'Yes, make ben Leader' }).click()
  await expect(L.getByRole('button', { name: 'Add task' })).toHaveCount(0, { timeout: 10_000 })
  await expect(L.getByRole('tab', { name: 'Logs' })).toHaveCount(0)

  expect(groupUrl).toContain('/g/')
  await leader.context.close()
  await member.context.close()
})
