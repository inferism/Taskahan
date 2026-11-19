# Taskahan design system

The November 2026 redesign uses the approved Taste **Achromatic ledger** app direction (seed 200265143) and **The sentence is the layout** public landing direction (seed 870207326). This replaces the earlier sports scoreboard styling.

## Visual language

Geist, self-hosted at weights 400, 500 and 600. Sentence-case headings, neutral surfaces, restrained borders, and circular pastel avatars. Blue means completed work; gray means work in progress; red signals blockers, overdue work and errors. Status glyphs and text carry the meaning without relying on color.

`src/styles/tokens.css` is the source of truth for both themes. Light uses #f3f4f3 ground, white surfaces and #181c19 ink. Dark uses #111111 ground, #1b1b1b surfaces and #f1f3f1 ink. Legacy token names such as `scoreboard-yellow` remain compatibility aliases for the neutral primary action color. Avatar colors remain stable by membership seat; their accessible labels retain the seat number.

## Screens

- `/` is the public landing page for guests and Your groups for signed-in users. The landing page includes a clearly labeled interactive sample board, question resolution example, progress example and account facts. Demo interactions only change local component state.
- `/login` and `/signup` share a quiet, narrow form layout and link back to the public page. Existing validation, captcha and error messages remain part of these flows.
- Your groups and Settings use shared desktop navigation. Group actions stay next to the page heading; settings use labeled sections with controls on neutral panels.
- At 1280px and wider, the board has a left workspace navigation, group toolbar, people columns, a blocked-task shortcut, and progress/chat panels beneath the board. Progress, Chat and leader-only Logs also have dedicated workspace views.
- At 768–1279px, columns scroll horizontally and Progress/Chat open side panels. Below 768px, named member buttons and swipeable columns sit above bottom section navigation.
- A column expands to reveal task details, status controls and questions. Done starts folded. Task links open the correct person and task. Former members retain their task history and takeover action.

## Interaction and accessibility

Use the existing shared buttons, fields, dialogs, menus and tabs. Primary actions have a neutral solid fill; secondary actions use a light border. Focus rings, keyboard access, loading/error states, retry controls and permission-based actions are required. Keep destructive actions explicit.

Small text is at least 12px; standard app body text is 14px. Touch controls are generally 44px high. Task columns and member selectors scroll within their containers, never widening the page. Hide only decorative avatar groups from assistive technology. Use visible text for status and accessible labels for icon-only actions.

Motion is short state feedback that plays once per change (240 to 420ms, ease-out): board and group-list rows rise in with a capped stagger, task details and Done unfold, status glyphs pop or sweep in, the status control's thumb slides, progress bars glide, dialogs scale in (sheets slide up on phones), toasts slide from the right, buttons dip on press, a teammate coming online pulses three times, finishing every task sweeps the bar once with an All done label, and realtime edits add an edge mark to the wash. The keyframes live in `src/styles/base.css` behind `prefers-reduced-motion: no-preference`, so reduced motion keeps every state change without movement. The public page demonstrates the actual product rather than using unrelated stock imagery or video.

## Validation

Unit tests cover public/protected routing, landing interactions, workspace navigation, blocker shortcuts and existing task behavior. Accessibility checks cover landing, authentication, board and settings; token tests check text/focus contrast in both themes and avatar contrast. Browser review covers 320, 390, 768, 1024 and 1440px layouts, plus dark mode.
