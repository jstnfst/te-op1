# te-op1 web app — Cloudflare Pages + D1 + OAuth

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

The C toolchain (`op1dump`, `json2aif`, …) is unchanged; the web validation/tag/
.aif logic in `functions/_shared/` is a TypeScript port of it.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # fill in OAuth client IDs/secrets + JWT_SECRET

# create the local D1 db and apply the schema
npx wrangler d1 migrations apply te-op1-db --local

# (optional) seed the community library from the generated samples.js
dump-samples.exe collection samples.js   # if samples.js isn't present
node scripts/seed.mjs --local

npm run dev    # Vite on :5173, wrangler Pages on http://localhost:8788
```

Open **http://localhost:8788** (the wrangler origin — that's where `/api/*` and
cookies work). For local OAuth, register `http://localhost:8788/api/auth/<provider>/callback`
as a redirect URI in each provider console.

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
variable name `DB`, database `te-op1-db`) for both Production and Preview — or rely
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

- `CLOUDFLARE_API_TOKEN` — a token with **Account › Cloudflare Pages › Edit** and
  **Account › D1 › Edit** (the migration step needs D1). The same token works for
  the local `wrangler` commands above — `export CLOUDFLARE_API_TOKEN=…`.
- `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard URL or `wrangler whoami`.

OAuth client IDs/secrets and `JWT_SECRET` are **not** CI secrets — they live on the
Pages project (`wrangler pages secret put`) and persist across deploys.

## OAuth app registration

Register each app and add the redirect URI `https://<name>.pages.dev/api/auth/<provider>/callback`
(plus the localhost one for dev):

- **Google** — console.cloud.google.com → APIs & Services → Credentials → OAuth client ID (Web).
- **Microsoft** — portal.azure.com → App registrations → New (use the `/common` tenant for personal + work accounts).
- **Yahoo** — developer.yahoo.com/apps → Confidential Client, enable OpenID Connect + Email/Profile.
- **GitHub** — github.com/settings/developers → OAuth Apps → New. Authorization callback URL `https://<name>.pages.dev/api/auth/github/callback` (register a second app for localhost). The `user:email` scope lets us read the primary email when it's private.

## How it works

- **Auth:** `/api/auth/:provider` redirects to the provider (signed-state CSRF +
  PKCE for Google/MS). The callback exchanges the code, fetches the profile,
  upserts the user in D1, and sets an HttpOnly signed-JWT session cookie.
- **Upload:** `POST /api/patches` validates the JSON (`functions/_shared/validate.ts`),
  derives tags, and stores it. Browsing/searching is `GET /api/patches`.
- **Download:** `GET /api/patches/:id/download` rebuilds the AIFF-C `.aif` from
  the stored JSON (`functions/_shared/aif.ts`). Note: JSON-only means **sampler
  audio is not preserved** — sampler downloads contain a 440 Hz sine.
- **Packs:** users curate patches into packs (`functions/api/packs/*`, tables in
  `migrations/0002_packs.sql`). `GET /api/packs/:id/download` streams a `.zip` of
  the pack's `.aif` files (public packs are downloadable by anyone; private by the
  owner). Ad-hoc multi-select bundles via `POST /api/patches/zip`. The ZIP is built
  in-worker by `functions/_shared/zip.ts` (DEFLATE via `CompressionStream`).

## Notes / follow-ups

- The reference pages (`params.html`, `display.html`, `patch.html`) are served
  as-is from `public/`; the SPA nav links to them. `patch.html?id=<n>` loads a
  community patch via the API. Porting these fully into React can come later.
