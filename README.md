# Binder — Pokémon card & price tracker

A Next.js app for browsing Pokémon card and sealed-product prices, tracking a personal collection, and logging buy/sell transactions for resale profit tracking.

There's no separate API layer — Server Components and Server Actions query Postgres directly through Prisma (see `lib/prisma.ts`). That means "the server" is really just "wherever Postgres lives." You can run this two ways:

## Option A — Run your own server (has Docker)

1. `npm install`
2. `cp .env.example .env`, then set a real `POSTGRES_PASSWORD` in `docker-compose.yml` and match it in `.env`'s `DATABASE_URL`.
3. `npm run db:up` (starts Postgres via Docker)
4. `npm run db:migrate` (applies the schema)
5. `npm run ingest:cards` to pull real card data (free, no API key — see `scripts/ingest-cards.ts`). Optionally `npm run ingest:sealed:pricecharting` for sealed products.
6. `npm run dev`, open [http://localhost:3000](http://localhost:3000)

## Option B — Connect to someone else's server (no Docker needed)

If another device on your [Tailscale](https://tailscale.com) network is already running the server (Option A), you don't need Docker or your own copy of the data:

1. Install Tailscale and join the same tailnet as the server device.
2. `git clone` this repo, `npm install`.
3. `cp .env.example .env`, then set `DATABASE_URL` to point at the server's Tailscale hostname instead of `localhost` (see comments in `.env.example` for the exact format — with MagicDNS enabled it looks like `<device-name>.<tailnet>.ts.net`).
4. `npx prisma generate` (generates your local Prisma client — doesn't touch the database).
5. `npm run dev`, open [http://localhost:3000](http://localhost:3000).

Do **not** run `npm run db:up`, `npm run db:migrate`, or any `ingest:*`/`snapshot:*` script as a client — those are server-only and act on the shared database.

## Schema changes

Only the server device should run migrations. Client devices just `git pull` (to get the new migration files already committed by the server device) and run `npx prisma generate` to refresh their local Prisma client.

This project's Prisma version can't run `prisma migrate dev` non-interactively, so migrations here are created manually:
```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# paste the output into a new prisma/migrations/<timestamp>_<name>/migration.sql
npx prisma migrate deploy
npx prisma generate
```
Restart your dev server afterward — the running Next.js process caches the Prisma client from before the schema change.

## Notes

- The server device needs to actually be on and Docker running whenever a client device needs access — this isn't a cloud-hosted always-on server.
- Postgres is exposed on port 5432. If you're using the Tailscale setup, scope your firewall rule to Tailscale's CGNAT range (`100.64.0.0/10`) rather than opening it to your whole LAN or the internet.

## Deployment: UAT and Production

There is no cloud host — both environments are self-hosted Windows services on the same physical machine (the "server device" above), each with its own checkout, database, and port. There is no TLS termination on the app itself; both are plain `http`, with real HTTPS added in front only where needed for remote/Google-login access (see below).

| | Prod | UAT |
|---|---|---|
| Checkout | `Pokemon App` (this repo, `master` branch) | `Pokemon App - UAT` (sibling checkout, `uat` branch) |
| Windows service (nssm) | `PokemonTCGApp` | `PokemonTCGApp-UAT` |
| Port | `3000` | `3001` |
| Database | `pokemon_tcg` (port 5432) | `pokemon_tcg_uat` (port 5433, `postgres-uat` container) |
| Remote HTTPS access | `https://jakepc.tail593b76.ts.net` via `tailscale funnel` (public) | `https://jakepc.tail593b76.ts.net:8443` via `tailscale serve` (tailnet-only) |

Both database containers are defined in the one `docker-compose.yml` (in the prod checkout) and started together with a single `docker compose up -d` — the UAT checkout's copy of that file is identical but isn't actually used to start anything separately.

### Workflow: always UAT before prod

Every change ships to UAT first, gets verified there, and only then gets promoted to prod. Never push straight to `master` without going through this:

```bash
# 1. Commit on master (this checkout)
git add <files>
git commit -m "..."

# 2. Ship to UAT first
git push origin master:uat
cd "../Pokemon App - UAT"
git pull origin uat
npm run build                 # + `npx prisma migrate deploy` first if the change touched prisma/schema.prisma
```
Then, from an **elevated** PowerShell (nssm needs admin rights to control services — a non-elevated shell gets `Access is denied`):
```powershell
nssm restart PokemonTCGApp-UAT
```
Verify on UAT (`http://localhost:3001`, or `https://jakepc.tail593b76.ts.net:8443` from another device). Once it's confirmed working:

```bash
# 3. Promote the same commit to prod
cd "../Pokemon App"
git push origin master        # master was already ahead locally from step 1
npm run build
```
```powershell
nssm restart PokemonTCGApp
```

### Remote / mobile access via Tailscale

Since neither service terminates TLS itself, reaching them from another device (not `localhost`) needs a real HTTPS front end — Google's OAuth policy also **requires** this: a redirect URI is only allowed to use `http` when the host is `localhost`/a loopback IP, so any real hostname (a Tailscale name, a LAN IP) must be `https` or Google rejects it outright with a `redirect_uri_mismatch` / "doesn't comply with Google's OAuth 2.0 policy" error, no matter how many times you re-add it.

```bash
tailscale serve status                                   # see what's currently configured
tailscale serve --bg --https=8443 http://127.0.0.1:3001  # example: add an https front end for UAT
```
Prod already has a public Funnel front end (`tailscale funnel ...`) at the bare hostname (443); UAT has a tailnet-only Serve front end at `:8443`. `--bg` is required for the mapping to persist — without it, the config disappears the moment the foreground command exits.

Every stable origin used to reach the app (local port, and each HTTPS front end above) needs to be added separately as an **Authorized redirect URI** on the Google OAuth client (Google matches the string exactly, including scheme and port):
- `http://localhost:3000/api/auth/google/callback` (prod, local)
- `http://localhost:3001/api/auth/google/callback` (UAT, local)
- `https://jakepc.tail593b76.ts.net/api/auth/google/callback` (prod, remote via Funnel)
- `https://jakepc.tail593b76.ts.net:8443/api/auth/google/callback` (UAT, remote via Serve)

One-off dev ports (`npm run dev` with `autoPort` picking a random port) don't need an entry — they're throwaway and change every run; Google login on those falls back to email/password.
