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
