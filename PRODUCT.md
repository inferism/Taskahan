# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: React + Vite + TypeScript single-page app (the whole product sits behind login, so no server rendering is needed), Supabase for auth, Postgres, realtime, presence and storage, deployed as static files to Cloudflare Pages. Reasoning lives in ARCHITECTURE.md. Project setup (Supabase project, hosting account) is done by the owner, not by the build agents.

## Users

Small groups of any kind that split work between people and need to see who is doing what. The group states its own purpose when it is created: the leader picks why the group exists (student group project, small work team, club or organization, or something else). No single audience is primary.

Two roles, scoped per group: a **Leader** who assigns and edits tasks, answers questions, removes members and reads the logs, and **Members** who work their own tasks, mark them done and ask questions. The same account can lead one group and be a member of another.

Used on phones and laptops equally. Both layouts are first-class.

## Product Purpose

Taskahan is a live task tracker for a group. Every member owns a column of their assigned tasks; everyone in the group sees every column update in real time. Success is a group that can answer "who has what, how far along is it, and who is stuck" in one look, without asking in a chat.

## Positioning

The unit of the board is the person, not the workflow stage. Columns are members, and a member's column outlives their account: when someone leaves or is removed the column stays as "Former member" with its tasks and messages intact, and a returning member with a new account can take those tasks over. Accounts are disposable (username and password, no email, no recovery); history is not.

## Operating Context

- Sign up and log in with a username and password only. No email, no password reset. A user who loses their password makes a new account, rejoins the group with its code, and takes over their old tasks.
- Accounts with no authenticated activity for 30 days are deleted automatically. This is explained at sign up.
- Home shows the groups the user already belongs to, plus Create and Join.
- Create: group name, purpose, member limit, and an 8-letter join code chosen by the leader. Join: enter an 8-letter code.
- Inside a group: member columns, a Task Progress chart, a group chat, and for the leader a Logs section.

## Capabilities and Constraints

- Tasks: title, details, assignee, deadline, status. Statuses are To do, In progress, Done and Blocked. A task becomes Blocked when its assignee has an unresolved question on it.
- Leader can add, edit, reassign and delete tasks. Members can change the status of their own tasks and open questions on them.
- Questions are discussion threads on a task, with replies from the leader and members and a Resolved state.
- Group chat: one general channel per group.
- Presence: online or offline only.
- Profile picture: upload with crop, zoom and preview; resized and compressed before upload; uploads validated; the previous image removed when replaced.
- Task Progress: one horizontal stacked bar per member split into Done, In progress and To do, labeled like "4 of 6 completed", with a blocked indicator.
- Leader can remove a member, and can transfer leadership to a member behind an "Are you sure" confirmation.
- Members can take over a former member's tasks.
- Logs: automatic and permanent within the group, visible to the leader. They record member actions such as took over tasks, marked done, asked a question.
- If a leader's account is deleted by the 30-day rule, leadership passes automatically to a random remaining member.
- Light mode and dark mode, chosen in settings.
- Terminology to keep: Leader, Member, Former member, Group, Join code, Task, Question, Resolved, Logs, Take over.
- Undecided: whether a group with no remaining members is deleted immediately or kept for a grace period (ARCHITECTURE.md proposes deletion); whether members other than the assignee can reply in a question thread (proposed: yes).

## Brand Commitments

The name is Taskahan. No logo, palette, typeface or voice has been fixed by the owner.

## Evidence on Hand

No screenshots, user research, testimonials or usage data exist. The source brief is the owner's PROMPT.MD. Future work must not invent customers, usage numbers or reviews.

## Product Principles

1. The person is the column. Work is always shown against who owns it.
2. History outlives accounts. Removing or losing an account never erases tasks, messages or logs.
3. Roles belong to the group, never to the account.
4. Low ceremony. No email, no recovery flow, an 8-letter code is the whole invitation.
5. The leader can always see what happened. Sensitive actions are logged automatically and cannot be edited.

## Accessibility & Inclusion

No formal standard was set by the owner. Inferred baseline, not confirmed: WCAG 2.2 AA contrast in both themes, full keyboard operation, status never conveyed by color alone, reduced-motion support.
