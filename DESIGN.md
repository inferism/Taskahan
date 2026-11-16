---
name: Taskahan
description: A live group task board where every member is a jersey on the scoreboard.
colors:
  court: "#0C5B49"
  court-deep: "#08463A"
  scoreboard-yellow: "#FFC42E"
  scoreboard-yellow-hover: "#F2B51B"
  ground: "#EEF2EE"
  surface: "#FFFFFF"
  surface-sunken: "#F4F6F4"
  line: "#D5DDD6"
  track: "#E3E8E3"
  ink: "#13211C"
  muted: "#5B6B64"
  done: "#1E8E5A"
  done-text: "#17774B"
  blocked: "#C93428"
  jersey-royal: "#2356D8"
  jersey-rust: "#B8500C"
  jersey-violet: "#7B3FE4"
  jersey-teal: "#0D7F86"
  jersey-magenta: "#C4267A"
  jersey-graphite: "#3F4A54"
  jersey-steel: "#1C75B5"
  jersey-brown: "#7A4A21"
  ground-dark: "#0B1512"
  surface-dark: "#12201B"
  surface-sunken-dark: "#0F1A16"
  line-dark: "#2A3F36"
  track-dark: "#22342C"
  ink-dark: "#E8EFEA"
  muted-dark: "#9DB0A7"
  done-dark: "#3FBF82"
  blocked-dark: "#F0685C"
typography:
  tally:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  name:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
  title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  top-bar:
    backgroundColor: "{colors.court}"
    textColor: "{colors.surface}"
    height: "56px"
    padding: "0 24px"
  button-primary:
    backgroundColor: "{colors.scoreboard-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.scoreboard-yellow-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "44px"
  jersey-tile:
    backgroundColor: "{colors.jersey-royal}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    size: "52px"
  member-column:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    width: "248px"
  member-column-expanded:
    width: "408px"
---

<!-- SEED: established with the user before implementation; re-run /impeccable document once there's code to capture the actual tokens and components. -->

# Design System: Taskahan

## Overview

**Creative North Star: "The Liga Scoreboard"**

Taskahan borrows from the barangay basketball league: the painted court, the block-numbered jerseys, the scoreboard everyone on the bleachers can read from across the gym. The product's rule is that the person is the column, so every member gets a jersey (a colour and a number that never change) and every column is headed by a scoreboard panel showing how many of their tasks are done. A glance across the board answers who has what, how far along it is, and who is stuck.

This is a working screen first. The league lends four things only: type (condensed block caps and tabular numerals), palette (court green, scoreboard yellow, jersey colours), density (tight rows, big numbers) and one signature move (the tally that rolls when a task is finished). Layout, navigation and controls are the standard web ones: a top bar, panels, tabs, buttons, inputs, dialogs. Nobody should have to learn the interface; it should simply feel like their group's board.

The app runs in two scenes and both are first-class: a laptop in a bright classroom or office at midday (light theme), and a phone in bed at 11 PM before a deadline (dark theme). Theme follows the system by default and can be set in Settings.

Voice is plain and short. Buttons name their action ("Add task", "Take over tasks", "Mark resolved"). Errors say what went wrong and what to do next. No exclamation marks, no mascots, no jokes at the user's expense.

**Key Characteristics:**
- One jersey per member: a fixed colour and a two-digit number from their join order
- A scoreboard header on every column with a large done-of-total tally
- Green, yellow and red mean status and nothing else
- Flat colour, 1px lines, no gradients, no resting shadows
- Five type sizes, no in-betweens
- Every task has a permanent number (#12) that chat, threads and logs all cite
- Time is read from position: columns sort by deadline and split at Today

## Colors

A committed court-green shell over a cool green-white ground, with scoreboard yellow for the one primary action and eight jersey colours for the people. All values live in the frontmatter; dark-theme counterparts carry the `-dark` suffix.

### Primary
- **Court Green** (`court`, `court-deep`): the top bar in both themes, the active tab underline, text links, task-number references in chat. `court-deep` is the group switcher's fill inside the bar and the bar itself in the dark theme.

### Secondary
- **Scoreboard Yellow** (`scoreboard-yellow`): the primary button, the selected segment of the status control, the In progress fill, and the brief wash on a row that someone else just changed. Text on yellow is always `ink`.

### Tertiary
- **Jersey colours** (`jersey-royal`, `jersey-rust`, `jersey-violet`, `jersey-teal`, `jersey-magenta`, `jersey-graphite`, `jersey-steel`, `jersey-brown`): member identity. A member's seat number picks the colour in that order and wraps after eight; the number itself tells apart two members who share a colour. Numerals on a jersey are always white, and every jersey colour clears 4.5:1 against white. Jersey colour appears only on the jersey tile and the chat avatar, never on task rows or bars.

### Neutral
- **Ground** (`ground` / `ground-dark`): the page behind the panels.
- **Surface** (`surface` / `surface-dark`): columns, roster, dock, dialogs, inputs.
- **Sunken** (`surface-sunken` / `surface-sunken-dark`): the open task's details block, former-member headers, table header rows.
- **Line** (`line` / `line-dark`): every border and divider, always 1px.
- **Track** (`track` / `track-dark`): the empty part of a progress bar, which is also the To do segment.
- **Ink** (`ink` / `ink-dark`): primary text. **Muted** (`muted` / `muted-dark`): secondary text, deadlines, task numbers.

### Status
- **Done** (`done`, text in `done-text`; `done-dark` in dark): filled circle with a check.
- **In progress** (`scoreboard-yellow`): circle half filled.
- **To do**: hollow circle in `muted`.
- **Blocked** (`blocked` / `blocked-dark`): rounded square with a question mark, plus the words "Blocked · 1 open question".
- **Online**: a filled `done` dot with the word "Online". Offline is a hollow ring with the word "Offline".

### Named Rules
**The Reserved Hues Rule.** Green, yellow and red belong to status. No jersey, badge, illustration or decoration may use them. If it is green, something is done or online; if it is yellow, something is in progress or is the main action; if it is red, someone is stuck or the action is destructive.

**The Shape And Word Rule.** Status is never colour alone. Each status has its own glyph shape and is written out in words wherever there is room.

**The Flat Colour Rule.** Colour is unmodulated. No gradients, no tints fading into each other, no grain or texture.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, sans-serif)
**Body Font:** Barlow (with system-ui, sans-serif)

**Character:** One family at two widths, the way a scoreboard painter uses one alphabet for the team names and the score. Condensed bold caps carry names and numbers; the regular width carries everything a person has to read and type. Both are self-hosted.

### Hierarchy
- **Tally** (700, 2.75rem, line-height 1, tabular numerals): the done-of-total number in a column header ("4/6", with the total set in `muted` at the Name size), and the wordmark on the log in screen.
- **Name** (700, 1.375rem, caps, 0.02em tracking): member names in column headers, the wordmark in the top bar, screen titles ("Your groups", "Log in"), jersey numerals.
- **Title** (600, 1rem): dialog titles, group names on Home, form inputs (16px so phones do not zoom), task titles and chat text on phones.
- **Body** (400, 0.875rem, line-height 1.45): task titles on desktop, details, chat, thread replies, button labels at 600. Long text wraps at 65 to 75 characters.
- **Label** (500, 0.75rem): deadlines, timestamps, captions, the "4 of 6 completed" line, helper and error text. Deadline group headings ("TODAY", "THIS WEEK") use Barlow Condensed 700 at 0.8125rem with 0.1em tracking, the single uppercase label style.

### Named Rules
**The Five Sizes Rule.** Text is set at 12, 14, 16, 22 or 44 pixels. Nothing in between, nothing larger. The deadline group heading at 13px is the one sanctioned exception.

**The Numbers Are Tabular Rule.** Every numeral that can change (tallies, counts, times, task numbers) uses tabular figures so nothing shifts when a value updates.

## Layout

The grid is a 4px base with the spacing scale in the frontmatter. Panels are separated by 1px lines, not by gaps or shadows; inside a panel, related rows sit 8 to 12px apart and groups are separated by 20 to 24px, with more space above a heading than below it.

### App shell
- **Top bar** (56px, court green, both themes): wordmark, group switcher (group name, purpose chip), join code with copy button, then on the right the online count, Add task (leader only), and your avatar menu (Settings, Log out). On Home and Settings the switcher and code are absent.
- **Board screen, 1280px and wider:** three panes. Left roster 288px (Task Progress). Centre board, flexible, scrolls horizontally when columns overflow. Right dock 336px with Chat and Logs tabs (Logs for the leader only).
- **768 to 1279px:** the board takes the full width. Roster and dock become panels that slide over the board from their own side, opened by "Progress" and "Chat" buttons in the top bar. One panel open at a time.
- **Under 768px:** one pane at a time with a bottom tab bar: Board, Progress, Chat, and for the leader Logs. On Board, one member's column owns the whole screen. A strip of jersey tiles under the top bar is the pager; swiping snaps hard to the next member with no half-way position. Add task becomes a full-width button above the tab bar.

### Board
- Column order: your own column first, then active members by seat number, then former members.
- Columns are 248px collapsed and 408px expanded. Your own column starts expanded. Selecting another column's header expands it and collapses the previous one. On phones every column is full width and always expanded.
- Inside a column, tasks are grouped under deadline headings in this order: Overdue, Today, This week, Later, No deadline, Done. Done is folded to a count ("Done · 4") until opened.
- Selecting a task opens its details inline beneath the row: status control, details text, deadline, the question thread. One task open per column. Selecting a task in a collapsed column expands that column first.
- The leader sees "Edit" on each open task and "Add task" in the top bar. The form is a dialog on desktop and a full-screen sheet on phones: title, details, assignee (a select listing active members by jersey), deadline.

### Task Progress (roster)
One row per member, same order as the columns: jersey tile, name, role, online state, a stacked bar (Done in green, In progress in yellow, the rest left as track), and the line "4 of 6 completed", followed by "· 1 blocked" with the blocked glyph when it applies. Selecting a row scrolls to and expands that member's column. A member with no tasks shows an empty track and "No tasks yet".

### Other screens
- **Log in / Sign up:** a single centred column, 360px wide, on the ground colour, wordmark above the form. Sign up carries a plain notice directly above its button: "No email and no password reset. If you forget your password you will need a new account. Accounts with no activity for 30 days are deleted."
- **Home:** title "Your groups", then two equal buttons, Create (primary) and Join (secondary). Below, your groups as rows, not cards: group name, purpose chip, your role, member count, and a thin overall progress bar. A new user sees only the two buttons and one line: "Create a group to lead it, or join one with its 8-letter code."
- **Create group:** name, purpose (Student project, Work team, Club or org, Other with a short note), member limit as a stepper from 2 to 30, and the join code field. A live line under the code says whether it is valid and free.
- **Join group:** one field, eight uppercase letters, wide letter-spacing, placeholder `XXXXXXXX`. Input uppercases as typed and ignores non-letters. Failure text is the same whatever the cause: "That code did not work. Check it with your leader."
- **Chat:** messages grouped by author with a small jersey tile, name and time. Task references like #14 are links in court green that open the task. Composer pinned to the bottom. Former members' messages show "#Name · Former member".
- **Logs (leader):** a dense table: time, jersey and name, a sentence ("Kim took over #13 and #16 from #Renz"), with filters for member and action. Read-only, newest first.
- **Settings:** avatar, theme (System, Light, Dark as a segmented control), log out.

### States every screen owes
Loading shows the real layout with `track`-coloured bars in place of text; no spinners on the board. Empty states say what to do next in one sentence. Errors appear inline next to the thing that failed, with a Retry button; toasts are for confirmations only. When the connection drops, a bar under the top bar says "Reconnecting…" and clears itself.

## Elevation & Depth

Flat. Surfaces sit on the ground separated by 1px lines and by the difference between `ground` and `surface`. Nothing has a shadow at rest.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 8px 24px rgb(19 33 28 / 0.18)` plus a 1px line): dialogs, menus, toasts, and the slide-over roster and dock between 768 and 1279px. In the dark theme the shadow alpha is 0.5 and the 1px line does most of the work.

### Named Rules
**The Flat At Rest Rule.** A shadow means "this is floating above the page and will go away". If it stays, it gets a line instead.

## Shapes

Small, even corners: 4px on status squares and chips inside rows, 6px on controls and jersey tiles, 8px on panels, columns and dialogs. Fully round is reserved for status circles, presence dots and the purpose chip. Borders are always 1px in `line`; the only heavier strokes are the 2px ring of a status glyph, the 2px dashed outline of a former member's jersey, and the 2px focus ring. No coloured edge stripes on rows or cards.

## Components

Specified here from the chosen direction; none is built yet.

### Jersey tile (signature)
A square with 6px corners in the member's jersey colour, their seat number in white Barlow Condensed 700, always two digits ("07"). Sizes: 52px in column headers, 36px in the roster, 28px in chat.
- **With a profile picture:** the photo fills the tile and the number moves to a jersey-coloured tab along the tile's bottom edge.
- **Online:** a `done` dot with a 2px `surface` ring on the top-right corner. Offline shows no dot; the header's status line carries the word.
- **Former member:** no fill, no photo, 2px dashed `muted` outline, number in `muted`. The retired jersey keeps its number forever.

### Scoreboard header (signature)
The head of every column: jersey tile, name in condensed caps, a status line beneath it ("Online · You", "Leader", "Former member"), and the tally at the right. Below it, the member's progress bar and the "4 of 6 completed" line.
- **The tally roll:** when a task is marked done, the done digit rolls up to its new value over 240ms with an ease-out curve, for everyone in the group at once. When a task is reopened it rolls down. With reduced motion the number simply changes.
- **Former member header:** `surface-sunken` background, name shown as "#Renz", and a "Take over tasks" secondary button under the task list.

### Task row
Status glyph, task number in `muted`, title, and one label line: the deadline ("Due today, 6:00 PM", "Due Fri, Nov 20", "Overdue by 2 days" in `blocked`), or "Blocked · 1 open question", or "Done Nov 12". Minimum height 44px. Hover and keyboard focus give the row a `surface-sunken` fill. A row changed by someone else flashes a `scoreboard-yellow` wash at 30% that fades over 600ms.

### Status control
A three-part segmented control: To do, In progress, Done. The selected segment is yellow with ink text. Only the assignee and the leader can use it; for everyone else it is replaced by the status written as text with its glyph. Blocked is not a segment: it appears on its own when a question is open and clears when the question is resolved.

### Question thread
Inside the open task. Each entry: small jersey tile, name, time, text. "Ask a question" is available to the assignee; a reply box to every member. The opener and the leader see "Mark resolved"; a resolved thread folds to one line ("Resolved by Jamie · 2 replies") with "Reopen".

### Buttons
- **Shape:** 6px corners, 40px tall (44px on phones), label in Barlow 600.
- **Primary:** scoreboard yellow with ink text. One per view.
- **Secondary:** surface fill, 1px ink border, ink text.
- **Quiet:** no border, ink text, `surface-sunken` on hover. Used for Cancel and for icon buttons.
- **Destructive:** surface fill, 1px `blocked` border and text; fills `blocked` with white text on hover. Used for Remove member, Leave group, Delete task.
- **Hover / Focus:** fills change in 120ms. Focus shows a 2px ring offset by 2px, `ink` in the light theme and `scoreboard-yellow` in the dark theme and on the top bar.
- **Disabled:** 45% opacity, no hover. **Busy:** label swaps to the action in progress ("Adding…"), width held.

### Inputs / Fields
- **Style:** surface fill, 1px `line` border, 6px corners, 44px tall, 16px text, label above in Label size at weight 600.
- **Focus:** border turns `ink` with the 2px focus ring.
- **Error:** border turns `blocked`, message below in `blocked` with the problem and the fix ("Codes are 8 letters, A to Z").
- **Join code field:** Barlow Condensed 700 at 22px, 0.18em tracking, centred.

### Chips
The purpose chip: fully round, Label size, white at 15% on the top bar and `surface-sunken` with `muted` text elsewhere. Informational only, never clickable.

### Tabs
Text tabs with a 3px court-green underline on the active one (yellow in the dark theme). Used in the dock and, as the bottom bar on phones, with a 20px icon above each label.

### Dialogs
8px corners, overlay shadow, 440px wide on desktop, full-screen sheet on phones. Title in Title size, one primary and one quiet button, primary on the right.
- **Transfer leadership:** "Make Bea the leader? You will become a member and lose access to Logs and task editing. Only Bea can undo this." Buttons: "Make Bea the leader", "Cancel".
- **Remove member:** states that their column stays as a former member and their access ends, with a checkbox "Also change the join code" ticked by default.
- **Take over tasks:** lists the former member's tasks with checkboxes, open tasks ticked, done tasks unticked. Button reads "Take over 2 tasks".

### Avatar cropper
A dialog with the image in a square crop frame, a zoom slider beneath, and a live preview of the result as a 52px jersey tile with the member's own number tab, so they see exactly what the group will see. Buttons: "Save photo", "Cancel", and "Remove photo" when one exists.

### Icons
Lucide, 20px, 1.75 stroke, `currentColor`. Status glyphs are the product's own small SVG set and are never swapped for library icons.

## Do's and Don'ts

### Do:
- **Do** keep green, yellow and red for status and the primary action only.
- **Do** pair every status and every presence state with a shape and a word.
- **Do** show the person wherever work is shown: jersey tile, then name, then the work.
- **Do** cite tasks by number everywhere (#14), linked to the task.
- **Do** use the five type sizes and tabular numerals.
- **Do** keep touch targets at 44px or more and make every action reachable by keyboard with a visible focus ring.
- **Do** honour reduced motion: the tally changes without rolling, washes do not fade in.
- **Do** theme the browser's own surfaces from the palette: text selection in yellow with ink text, the caret in ink, scrollbars in `line` on `ground`.

### Don't:
- **Don't** dress the interface as a scoreboard. No LED or seven-segment digits, no court lines, no basketball icons, no wood or net textures. The league gives type, colour, density and the tally, nothing more.
- **Don't** use gradients, glows, glass, grain or resting shadows.
- **Don't** put a coloured stripe on the edge of a row or card.
- **Don't** use jersey colours for anything but the jersey tile and chat avatar.
- **Don't** nest cards, or turn rows of data into a grid of cards.
- **Don't** open a dialog for something that can happen in place. Dialogs are for adding and editing a task, the avatar cropper, and the three confirmations above.
- **Don't** use emoji or Unicode symbols as icons.
- **Don't** show a real profile picture or the online dot for a former member.
