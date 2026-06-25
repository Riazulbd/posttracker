# Post Tracker

Self-hosted replacement for the "TikTok & IG Post Tracker" Google Sheet.

It scrapes Instagram & TikTok posts with **Apify**, stores **only new/unique
posts** in **Supabase** (existing posts get their stats refreshed), computes the
engagement metrics, and shows everything in a web dashboard. A worker runs the
scrape automatically **every Monday & Friday**.

```
Apify actors ──> scrape.ts (dedup + map) ──> Supabase (Postgres)
                                                   │
                          worker (Mon/Fri cron) ───┘
                                                   │
                                          Next.js dashboard
```

## What you get

- **Unique posts only** — deduplicated on the post URL. Re-scraping refreshes
  stats instead of creating duplicate rows. A `post_snapshots` table also keeps
  a history of each scrape so you can track growth over time.
- **Metrics computed in the database** (Postgres generated columns), so they're
  always consistent and match the spreadsheet columns:
  | Column | Formula |
  | --- | --- |
  | Total Interactions | likes + comments + shares |
  | Engagement Rate % | total interactions ÷ followers |
  | Comment-to-Like % | comments ÷ likes |
  | Share-to-View % | shares ÷ video plays |
  | Engagement-to-Views % | total interactions ÷ video plays |
  | Content Resonance % | likes ÷ total interactions |
  | Influencer Efficiency % | video plays ÷ followers (reach efficiency) |
  | Virality Index % | shares ÷ total interactions |
- **Dashboard** with summary cards, search, and platform/influencer filters.
- **Dockerized** — `docker compose up -d` runs the dashboard + the scheduler.

## Tech stack

Next.js 14 (dashboard + API) · TypeScript · Supabase (Postgres) ·
Apify (`apify-client`) · node-cron (scheduler) · Tailwind CSS · Docker.

---

## 1. Supabase setup

1. Open your project (ref `lkbscrsgoxvetbtvbles`) → **SQL Editor**.
2. Paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   This creates `tracked_accounts`, `posts`, `post_snapshots`, the metric
   columns, RLS, and seeds the accounts to track.
3. Get your keys from **Project Settings → API**: the **Project URL** and the
   **`service_role`** key (server-side only — never expose it to the browser).

The seeded accounts (edit the `tracked_accounts` table any time to add/remove):

| Display name | Instagram |
| --- | --- |
| Lindsey Ranzau | `lindseyranzau` |
| Jenny Anderson Brown | `jbird929` |
| Alicia Metzen | `ali_denae`, `josijamesco` |
| Megan Stuart | `meganstuartt` |
| Sadie Carlisle | `sadie.carlisle` |
| Amy Flasch | `lifeintheflaschlane` |

## 2. Apify setup

Uses three actors (override via env if you prefer others):

- `apify/instagram-post-scraper` — posts for each Instagram account
- `apify/instagram-profile-scraper` — follower counts (needed for engagement rate)
- `clockworks/tiktok-scraper` — TikTok posts (only if you add TikTok accounts)

Grab your API token from
[Apify → Settings → Integrations](https://console.apify.com/account/integrations).

### 💸 Cost control (you're on the $5 free tier)

Apify bills per result: **post scraper ≈ $1.70 / 1000 posts**,
**profile scraper ≈ $2.60 / 100 profiles**. This project is tuned to stay cheap:

- `APIFY_RESULTS_LIMIT=10` — only the 10 most recent posts per account per run.
  With 7 accounts × 2 runs/week that's ~140 posts/run → **~$0.24/week**.
- `FOLLOWER_REFRESH_DAYS=7` — follower counts are re-fetched at most once a week
  (otherwise the cached value is reused). 7 profiles/week → **~$0.18/week**.

So a normal week costs roughly **$0.40**. Tune both values up/down to trade
freshness for cost. Set `FOLLOWER_REFRESH_DAYS=0` to refresh followers every run.

## 3. Configure environment

```bash
cp .env.example .env
```

Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_TOKEN`, and a long
random `CRON_SECRET`. Optionally set `DASHBOARD_USER` / `DASHBOARD_PASSWORD` to
password-protect the dashboard with HTTP Basic Auth.

## 4. Run locally

```bash
npm install
npm run scrape    # one-off scrape to populate the table (tests your Apify setup)
npm run dev       # dashboard at http://localhost:3000
npm run worker    # (optional) run the Mon/Fri scheduler in another terminal
```

## 5. Deploy to your VPS with Docker

```bash
# on the VPS, in the project folder with your .env present
docker compose up -d --build
```

- `web` → dashboard on port `3000` (put Nginx/Caddy in front for HTTPS).
- `worker` → runs the scrape on `SCRAPE_CRON` (default `0 9 * * 1,5` = 09:00
  Mon & Fri, in the `TZ` you set).

Trigger a scrape manually any time:

```bash
curl -X POST https://your-host/api/scrape -H "Authorization: Bearer $CRON_SECRET"
```

Health check: `GET /api/health`.

## 6. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: post tracker"
git branch -M main
git remote add origin https://github.com/Riazulbd/posttracker.git
git push -u origin main
```

`.env` is gitignored — your secrets stay out of the repo.

## Project layout

```
src/
  lib/        env, supabase client, apify client, mappers, scrape orchestration
  worker/     node-cron scheduler (Mon/Fri)
  scripts/    scrape-once.ts (manual run)
  app/        Next.js dashboard + API routes (/api/scrape, /api/health)
supabase/
  migrations/ 0001_init.sql
```

## Adapting to different Apify actors

Actor output schemas vary. If a column comes through empty after switching
actors, adjust the field lookups in [`src/lib/mappers.ts`](src/lib/mappers.ts)
(it tries several key names per field) and the actor inputs in
[`src/lib/apify.ts`](src/lib/apify.ts).
