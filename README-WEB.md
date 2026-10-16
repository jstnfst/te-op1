# te-op1 web app - Cloudflare Pages + D1 + OAuth

The site is a Vite + React + TypeScript SPA served by **Cloudflare Pages**, with
**Pages Functions** (`functions/`) for the API and **D1** for storage. Users log
in with Google / Microsoft / Yahoo and upload presets (JSON only); the `.aif` is
reconstructed on download. Browsing is public; only uploading needs login.

```
src/            React SPA (home, login, browse, upload, my patches)
functions/      Pages Functions: /api/auth/*, /api/patches/*, /api/me/*
functions/_shared/  jwt, oauth, cookies, session, validate, tags, aif, db
public/         legacy reference pages (params.html, display.html, patch.html) + _redirects
migrations/     D1 schema
scripts/seed.mjs  import samples.js -> D1
```

The C toolchain (`mondo dump`, `mondo build`, …) is unchanged; the web validation/tag/
.aif logic in `functions/_shared/` is a TypeScript port of it.

## Local development

`./master-control.sh` runs everything below (bash: Git Bash on Windows, or
macOS/Linux). `./master-control.sh help` lists every command.

```bash
./master-control.sh setup          # npm ci, .dev.vars, local DB schema, Playwright browser
./master-control.sh doctor         # check Node 22+, deps, .dev.vars, compiler, ports, gh
./master-control.sh db seed        # (optional) import samples.js into the local library
./master-control.sh dev up         # build, then run the dev server in the background
./master-control.sh dev login      # sign in as a mock persona (musician, github, admin, banned)
./master-control.sh test website   # smoke-test every page on desktop + phone widths
./master-control.sh dev down       # stop it and free ports 8788 / 5173
```

| Group | Commands |
|---|---|
| `dev` | `up`, `down`, `status`, `restart`, `logs`, `login [persona]` |
| `build` | `c` (mondo: cl, else clang, else gcc), `web`, `all`; also `webapp typecheck`, `webapp build` |
| `c` | `dump <file\|dir>`, `samples` |
| `db` | `migrate [--remote]`, `seed [--remote]`, `volume [--clean]`, `reset`, `sql "<sql>"` |
| test | `test website` (= `smoke`), `shot <path> [--mobile] [--as persona] [--base url]` into `shots/` |
| ship | `deploy` (push master, follow the CI run, check prod), `deploy status`, `prod check` |

The same steps by hand:

```bash
npm install
cp .dev.vars.example .dev.vars        # fill in OAuth client IDs/secrets + JWT_SECRET

# create the local D1 db and apply the schema
npx wrangler d1 migrations apply te-op1-db --local

# (optional) seed the community library from the generated samples.js
mondo.exe samples collection samples.js   # if samples.js isn't present
node scripts/seed.mjs --local

npm run dev    # Vite on :5173, wrangler Pages on http://localhost:8788
```

Open **http://localhost:8788** (the wrangler origin - that's where `/api/*` and
cookies work). For local OAuth, register `http://localhost:8788/api/auth/<provider>/callback`
as a redirect URI in each provider console.

Port 8788 serves the built `dist/` (wrangler's proxy doesn't reach Vite here),
so run `npm run build` after frontend changes. `functions/` reloads on its own;
`.dev.vars` changes need a restart of `npm run dev`.

### Volume data (dev only)

`node scripts/seed-volume.mjs` fills the **local** D1 with enough rows to exercise
the long lists: 600 patches for the dev Musician persona (half public), 300 public
patches by other local users, 80 packs (one holding 200), and ~300 likes. Every row
is named `vol …`; `node scripts/seed-volume.mjs --clean` removes them. Sign in once
as Musician (Dev login) first so the user exists. It refuses `--remote`.

### Paged list APIs

List endpoints answer `{ items, total, page, hasMore, asof }` with `?page=N` (24
per page). Pass the first response's `asof` back on later pages to freeze offsets.
`/api/patches` and `/api/packs/public` always page; `/api/me/patches`, `/api/packs`
(also `?q=`), and `/api/favorites?kind=patch|pack` page only when `?page=` is sent,
so existing unpaged callers (e.g. `patch.html`'s picker on `/api/me/patches`) are
unchanged. `/api/packs/:id/items?page=N` pages a pack's patches; `?ids=1` returns
just their ids (pack Select all).

### Mock login (dev only)

With `DEV_LOGIN=1` in `.dev.vars`, the login page shows a **Dev login** panel
with mock personas, so signed-in flows can be tested without real OAuth:

| Persona | What it tests |
|---|---|
| Musician | a regular signed-in user (FAVES, MINE, upload, likes, packs) |
| GitHub user | `provider = github`, so the ISSUES tab shows (no real GitHub token) |
| Admin | signs in with the first `ADMIN_EMAILS` address, so MOD and `/mod` work |
| Banned user | login is refused with the suspended-account message |

Personas are real rows in the **local** D1 (`provider_user_id = 'dev:<id>'`) and
get normal session cookies, so every downstream check runs unchanged. Log out
with the header's log out link. Direct URL: `/api/auth/dev?as=musician&next=/library/mine`.

It can't run in production. `functions/_shared/devLogin.ts` requires all three
of `DEV_LOGIN=1`, a plain-http localhost `SITE_URL`, and a request to a
loopback host; otherwise `/api/auth/dev` is a 404 and the panel never renders.
Never set `DEV_LOGIN` in `wrangler.toml` `[vars]` or as a Pages secret.

## One-time Cloudflare setup

```bash
npx wrangler login

# 1) Create the D1 database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create te-op1-db
npx wrangler d1 migrations apply te-op1-db --remote

# 2) Create the Pages project (this gives you the <name>.pages.dev URL)
npx wrangler pages project create te-op1 --production-branch master

# 3) First deploy
npm run deploy        # vite build && wrangler pages deploy ./dist
```

Bind D1 to the Pages project (Dashboard → the project → Settings → Bindings → D1,
variable name `DB`, database `te-op1-db`) for both Production and Preview - or rely
on the `[[d1_databases]]` block in `wrangler.toml`.

### Secrets (production)

Set `SITE_URL` to your `https://<name>.pages.dev` (Dashboard var) and add:

```bash
for S in JWT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET \
         MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET \
         YAHOO_CLIENT_ID YAHOO_CLIENT_SECRET \
         GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET; do
  npx wrangler pages secret put $S --project-name te-op1
done
```

## Continuous deployment (GitHub Actions)

`.github/workflows/deploy.yml` builds, applies D1 migrations, and deploys to
Pages on every push to `master` (and via manual *workflow_dispatch*). It uses
Direct Upload (`wrangler pages deploy`), so the Pages project must already exist
(`wrangler pages project create te-op1 --production-branch master`).

Add two **repository secrets** (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` - a token with **Account › Cloudflare Pages › Edit** and
  **Account › D1 › Edit** (the migration step needs D1). The same token works for
  the local `wrangler` commands above - `export CLOUDFLARE_API_TOKEN=…`.
- `CLOUDFLARE_ACCOUNT_ID` - from the Cloudflare dashboard URL or `wrangler whoami`.

OAuth client IDs/secrets and `JWT_SECRET` are **not** CI secrets - they live on the
Pages project (`wrangler pages secret put`) and persist across deploys.

## OAuth app registration

Register each app and add the redirect URI `https://<name>.pages.dev/api/auth/<provider>/callback`
(plus the localhost one for dev):

- **Google** - console.cloud.google.com → APIs & Services → Credentials → OAuth client ID (Web).
- **Microsoft** - portal.azure.com → App registrations → New (use the `/common` tenant for personal + work accounts).
- **Yahoo** - developer.yahoo.com/apps → Confidential Client, enable OpenID Connect + Email/Profile.
- **GitHub** - github.com/settings/developers → OAuth Apps → New. Authorization callback URL `https://<name>.pages.dev/api/auth/github/callback` (register a second app for localhost). The `user:email` scope lets us read the primary email when it's private.

## How it works

- **Auth:** `/api/auth/:provider` redirects to the provider (signed-state CSRF +
  PKCE for Google/MS). The callback exchanges the code, fetches the profile,
  upserts the user in D1, and sets an HttpOnly signed-JWT session cookie.
- **Upload:** `POST /api/patches` validates the JSON (`functions/_shared/validate.ts`),
  derives tags, and stores it. Browsing/searching is `GET /api/patches`.
- **Download:** `GET /api/patches/:id/download` rebuilds the AIFF-C `.aif` from
  the stored JSON (`functions/_shared/aif.ts`). Note: JSON-only means **sampler
  audio is not preserved** - sampler downloads contain a 440 Hz sine.
- **Packs:** users curate patches into packs (`functions/api/packs/*`, tables in
  `migrations/0002_packs.sql`). `GET /api/packs/:id/download` streams a `.zip` of
  the pack's `.aif` files (public packs are downloadable by anyone; private by the
  owner). Ad-hoc multi-select bundles via `POST /api/patches/zip`. The ZIP is built
  in-worker by `functions/_shared/zip.ts` (DEFLATE via `CompressionStream`).

## Notes / follow-ups

- The reference pages (`params.html`, `display.html`, `patch.html`) are served
  as-is from `public/`; the SPA nav links to them. `patch.html?id=<n>` loads a
  community patch via the API. Porting these fully into React can come later.
