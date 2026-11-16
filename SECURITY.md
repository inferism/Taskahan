# Taskahan Security

How Taskahan protects accounts, groups and history. This document is the rulebook for anyone writing code here. The system it describes is in [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. What we are protecting, and from whom

| Asset | Why it matters |
|---|---|
| Group contents (tasks, questions, chat) | Private to the group's active members |
| Roles | Only the leader may assign, edit, remove and read logs |
| History (former members' tasks, messages, logs) | Must survive account loss and must not be rewritable |
| Accounts | A password is the only credential and cannot be recovered |
| The database quota | Throwaway accounts must not be able to fill it |

| Who might attack | What they try |
|---|---|
| A stranger | Guess a join code, mass-create accounts, spam |
| A member | Act as leader, edit others' tasks, read logs, tamper with history |
| A removed member | Keep reading, or get back in |
| A curious leader | Rewrite or delete logs after the fact |
| Anyone with a browser console | Call the API directly, skipping the UI |

The last row sets the ground rule: **the UI is not a security boundary.** Every rule below is enforced in Postgres. Hiding a button is a convenience, never a control.

## 2. Authentication

- Username and password only, through Supabase Auth. The username maps to a synthetic email `{username}@users.{app-domain}` that is never shown, never emailed, and has confirmation turned off.
- A trigger on `auth.users` rejects any sign up whose email does not match that pattern, so the Auth API cannot be used to create accounts with real or arbitrary emails.
- Usernames: 3 to 20 characters, `a-z 0-9 _`, stored case-insensitively, immutable.
- Passwords: 8 to 72 characters. The sign-up form rejects a password equal to the username and shows a strength hint. Hashing is handled by Supabase Auth (bcrypt). The app never sees or stores a password outside the sign-in call.
- **There is no password reset.** The sign-up screen must say this in plain words before the user submits, together with the 30-day deletion rule. A lost password means a new account.
- Log-in errors are generic ("Wrong username or password"). Sign up necessarily reveals whether a username is taken; that is accepted.
- Sign up is protected by Cloudflare Turnstile, verified by Supabase Auth's built-in CAPTCHA setting, and by Supabase's own auth rate limits.
- Sessions are Supabase JWTs with rotating refresh tokens, stored by `supabase-js` in `localStorage`. Because a script running on the page could read them, the content security policy in section 8 is mandatory, not optional.
- Log out revokes the refresh token.

## 3. Authorization

### The model
- Access to a group requires a membership with `status = 'active'` whose `user_id` is the caller. Nothing else grants access.
- Role is read from that same row, per group. There is no global admin and no role stored on the account.
- Former members keep their row for history, and lose access because every check requires `active`.

### Who may do what

| Action | Leader | Assignee | Other member | Former / outsider |
|---|---|---|---|---|
| See board, chat, threads | yes | yes | yes | no |
| See and share join code | yes | yes | yes | no |
| Create, edit, reassign, delete task | yes | no | no | no |
| Change a task's status | yes | own task | no | no |
| Ask a question on a task | no (replies instead) | own task | no | no |
| Reply in a thread | yes | yes | yes | no |
| Resolve or reopen a question | yes | if they opened it | no | no |
| Send chat message | yes | yes | yes | no |
| Take over a former member's tasks | yes | yes | yes | no |
| Remove a member, change join code, edit group | yes | no | no | no |
| Transfer leadership | yes | no | no | no |
| Read logs | yes | no | no | no |
| Leave the group | after transferring | yes | yes | n/a |

### Enforcement rules for code
1. Row level security is enabled on every table in `public`, with no exceptions. A table without policies is unreadable by default; keep it that way until a policy is written on purpose.
2. Clients get `select` policies only. **There are no insert, update or delete policies for the `authenticated` role.** All writes go through the `security definer` functions listed in ARCHITECTURE.md section 5.
3. Every write function:
   - reads the caller from `auth.uid()` and nothing else. It never accepts a user id, membership id "of the caller", or role as a parameter;
   - looks up the caller's active membership and role inside the function;
   - validates every argument (length, enum, ownership, same-group);
   - sets `search_path = ''` and schema-qualifies every name;
   - writes its log row in the same transaction.
4. `execute` on write functions is revoked from `public` and `anon` and granted to `authenticated` only. Helper functions live in a `private` schema that is not exposed through the API.
5. Cross-group references are checked explicitly: the assignee must belong to the task's group, the thread to the task, and so on. Never assume ids passed together belong together.
6. The `anon` role can do nothing except sign up and log in.

## 4. Join codes

- Eight uppercase letters, chosen by the leader, unique across all groups.
- A code is a shared secret, and a leader-chosen word is guessable. Controls:
  - `join_group` is rate limited per account: 10 failed attempts per hour, then locked for the hour.
  - The response to a wrong code, a full group and a blocked account is the same generic failure, so the function cannot be used to test whether a code exists.
  - The member limit caps how many people a leaked code can admit.
  - Every join is logged and visible on the board immediately.
  - The leader can change the code at any time, and is offered the option whenever they remove someone.
- Removing a member blocks that account from rejoining. It cannot stop the same person with a new account, which is why the code change exists.

## 5. Logs and history integrity

- `logs` has no client write path. Rows are inserted only inside write functions.
- A trigger rejects every UPDATE on `logs`, and every DELETE unless the parent group is already deleted. This applies to the leader and to the service role alike; only a deliberate migration could bypass it.
- Tasks are soft-deleted, messages cannot be edited or deleted, and memberships are never removed, so the board, chat and logs always agree about what happened.
- Take over is the one action where a member changes ownership of work without the leader. It is restricted to tasks of former members, takes a row lock, and is always logged with the list of task numbers.
- Only the current leader can read logs. After a transfer the previous leader loses that access at once.

## 6. Input handling and XSS

- All user text (names, task titles, details, chat, questions) is rendered as text by React. `dangerouslySetInnerHTML` is forbidden in this codebase, as is any Markdown or HTML rendering of user content in v1.
- URLs in chat or details are not auto-linked in v1. If added later, only `http:` and `https:` links, with `rel="noopener noreferrer nofollow"`.
- Length and format limits are enforced twice: Zod in the client for a good error message, SQL `check` constraints and function validation as the real control.
- Text is trimmed and control characters are stripped server-side. Display names of former members are shown with a leading `#` by the UI, never stored with it.
- No user input is ever concatenated into SQL. Functions use parameters only; no dynamic `execute` with user strings.

## 7. Avatars and storage

- Bucket `avatars`: only `image/webp`, maximum 200 KB, set on the bucket itself.
- Storage policies: a user may insert and delete objects only under `{their user id}/`. No update. Read is public.
- The client only ever uploads the canvas-re-encoded image, never the original file, which strips EXIF data including location.
- The `set-avatar` Edge Function confirms the object is in the caller's folder and starts with a valid WebP signature before pointing the profile at it, then deletes the previous object. A weekly sweep removes orphans.
- Avatar paths are random UUIDs. Old avatars stop being referenced and are deleted, so a replaced image does not linger.

## 8. Browser hardening

Served from Cloudflare Pages through a `_headers` file:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' blob: data: https://<project>.supabase.co; connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co; frame-src https://challenges.cloudflare.com; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

No inline scripts, no third-party scripts other than Turnstile, fonts self-hosted. If a dependency needs `unsafe-inline` or `unsafe-eval`, pick a different dependency.

## 9. Secrets and keys

| Key | Where it lives | Notes |
|---|---|---|
| Supabase URL, publishable (anon) key | client bundle | Public by design. Safe only because of row level security |
| Turnstile site key | client bundle | Public |
| Supabase secret (service role) key | Edge Function secrets only | Bypasses row level security. Never in the repo, the client, a `VITE_` variable, logs, or a chat message |
| Turnstile secret | Supabase Auth settings | |
| Cron shared secret | Edge Function secrets and the cron job definition | `purge-inactive` and `sweep-avatars` reject calls without it |

- `.env*` is git-ignored; `.env.example` holds names only.
- Edge Functions verify the caller's JWT (`set-avatar`) or the cron secret (`purge-inactive`, `sweep-avatars`), and use the service key only for the specific admin calls they need.
- If a secret is ever committed, rotate it. Removing the commit is not enough.

## 10. Abuse and quota

| Control | Limit |
|---|---|
| Sign up | Turnstile + Supabase auth rate limits |
| Join attempts | 10 failed per account per hour |
| Chat messages | 30 per account per minute |
| Questions and replies | 20 per account per minute |
| Groups per account | 20 active memberships |
| Tasks per group | 500 active |
| Inactive accounts | deleted after 30 days without authenticated activity |

Limits are enforced inside the write functions using the `rate_limits` table. The 30-day purge releases memberships, hands over leadership, deletes the avatar and then the auth user, as described in ARCHITECTURE.md section 7.

## 11. Realtime

- Group channels are private. A policy on `realtime.messages` allows subscribing and tracking presence only for active members of that group.
- Database change events pass through row level security, so a removed member stops receiving events the moment their membership flips.
- Presence payloads carry only the membership id. Clients must ignore presence entries whose membership id is not an active member in their snapshot.
- Realtime events are hints. Authoritative data always comes from a `select` under row level security.

## 12. Privacy

- Data collected: username, password hash, optional avatar, and what the user types into groups. No email, phone, real name, location or analytics.
- Avatars are public-read at unguessable URLs. Say so next to the upload button.
- Deleting an account removes the profile, credentials and avatar. Display name, tasks and messages remain in the groups as a former member; this is the product's stated behavior and is explained at sign up.

## 13. Risks we accept

| Risk | Why accepted |
|---|---|
| Lost password means lost account | The brief's choice. Mitigated by Take over |
| Leader-chosen join codes can be guessed | Rate limit, member limit, logs, code change |
| A removed person can return with a new account | Unavoidable with disposable accounts. Code change is the control |
| A member can take over a former member's tasks that were never theirs | The brief's choice. Always logged |
| Sign up reveals which usernames exist | Inherent to username sign up |
| Tokens in `localStorage` | Standard for single-page apps on Supabase. Mitigated by strict CSP and no HTML rendering |

## 14. Checklist before launch

Reviewed 2026-11-17 (TASK.md 10.4) against the local stack with every migration applied. Items that can only be seen on the hosted project or the live site say so and are re-checked in the launch step (10.8).

- [x] Every `public` table has row level security enabled. A catalog query finds no table in `public` without it, and the pgTAP structure test asserts it. `supabase db lint` reports no security issue (its one warning is `get_group_snapshot` being STABLE while it calls the lock-capable `private.caller_seat`, which it calls without a lock). Re-check the hosted security advisor at launch.
- [x] No insert, update or delete policy exists for `authenticated` or `anon`. `pg_policies` in `public` holds only SELECT policies for `authenticated`; neither role has a table write grant, and `anon` has no grant at all.
- [x] pgTAP suite passes: 17 files, 819 tests. This review found the matrix's "covers every function" guard out of date after 9.3 added `orphan_avatars` (CI had been red since); the function now has its matrix row, refused for every actor.
- [x] Calling each write function with another group's ids fails: the matrix covers create, update (including reassigning across groups) and delete of tasks, and the group, task and thread suites cover leaders and members of another group.
- [x] `logs` rejects UPDATE and DELETE from the service role (`logs_guard` and `logs_guard_truncate` triggers enabled; `logs_guard.test.sql`).
- [x] Service key appears nowhere in the repo, its history or the built bundle. The only `sb_secret_` text in `dist` is supabase-js's own key-prefix check. The three Edge Functions read the key from their environment; `purge-inactive` and `sweep-avatars` refuse any call without a cron secret of at least 16 characters, compared in constant time, and `set-avatar` requires a valid user JWT.
- [x] Email confirmation off, sign-up email pattern trigger active, Turnstile on. Locally `enable_confirmations = false` and the `taskahan_guard_email` trigger is enabled on `auth.users`; on the hosted project both were set in 0.5 and 0.6 and confirmed by the 1.5 spike.
- [ ] CSP header present in production with no console violations. The build emits `dist/_headers` with the section 8 policy filled in for the project URL (10.1). Not yet verifiable: there is no production deploy until 10.8, which must confirm the header and a clean console.
- [x] Avatar bucket rejects a non-WebP file and a file over 200 KB: the bucket is `image/webp` only with a 204800-byte limit, asserted in `avatars.test.sql`.
- [x] Purge job tested against a seeded 31-day-old account that leads a group (`release_account.test.sql`: leader with members, leader alone, plain member).
- [x] A removed member's open tab stops updating and is sent Home. The two-browser e2e test was failing in CI because the notice read "You no longer have access" when the refusal arrived before the membership change; the board now reads the caller's own membership row to say "You were removed", and the test passes.

## Reporting a problem

Open a private security advisory on the repository, or contact the owner directly. Please do not file public issues for vulnerabilities.
