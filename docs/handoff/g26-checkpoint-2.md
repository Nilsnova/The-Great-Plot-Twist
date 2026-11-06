# G26 checkpoint 2 — notice and standalone page (C2)

Added [PRIVACY.md](../PRIVACY.md), [the inventory](../DATA-INVENTORY.md), [privacy.html](../../frontend/privacy.html), its own [script](../../frontend/public/privacy.js) and [styles](../../frontend/public/privacy.css). They explain retention gaps, deletion limits, local/session storage and tokens, provider disclosures, play-money-only terms and contact with Nils through the course page. Each notice is marked “student project, not legal advice”. No contact email or legal/compliance claim was added.

The page has semantic headings, a skip link, section navigation, readable phone styles and optional printing. Its CSP allows same-origin scripts/styles/images, blocks inline script/style and all connections, and restricts base URLs/forms. It loads no game bundle, fonts, third-party code or data feed and writes no storage. Content remains available with JavaScript disabled.

## Production delivery without editing the build configuration

Vite currently builds an explicit list of HTML entries. Adding only `frontend/privacy.html` would not deliver the page. The new `frontend/public/privacy.html` is a relative symlink to `../privacy.html`; Vite follows it and copies a regular `dist/privacy.html`. The new public script/styles are copied alongside it. This keeps one source HTML page and leaves existing Vite/application code and `vercel.json` unchanged. Verify this copied output, not only a dev-server source URL. No edit to existing code, migrations, STATUS.md or DECISIONS.md is part of G26.

## G9 link handoff

G9 should add a normal **“Privacy & play money”** link to **`/privacy.html`** in the title/sign-in screen before the player signs in and in the in-game pause/settings menu so it remains findable. Use a normal navigable anchor; the notice works independently of game startup or authentication. On a deployment beneath a path prefix, resolve `privacy.html` from the app base. G26 supplies the page; the existing game menus are intentionally untouched.

Keep the Markdown notice and static HTML text aligned when data handling changes. The detailed inventory is for repository/course review; the player page does not link to Markdown paths that the deployment does not serve. Checkpoint 3 records final gates and UI evidence.
