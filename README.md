# Sandlot

**Formerly SwapAround.** A free, parent-run app for:

- Fidget / plushy / toy **exchange**
- Supervised **playdates** and kids meetups
- Family connections around local fun — not loneliness apps for kids

Product name: **Sandlot**  
Codebase folder (legacy): `swaparound/`  
Database tables (LPL Supabase): keep the `swaparound_*` prefix so production data stays stable.

## Stack

- Next.js 15 (App Router)
- Supabase Auth + Postgres (shared Life Produces Life project, RLS)
- Vercel hosting (`swaparound` project → rename target: Sandlot)

## Local setup

```bash
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` for day-to-day work; production keeps it in Vercel only for server routes.

## Database migrations

SQL lives in `db/` and is applied on the LPL Supabase project in order:

1. `0001_marketplace_and_trades.sql`
2. `0002_toy_photos_browse_safety.sql`
3. `0003_growth_crm_viral.sql`
4. `0004_venue_invites_portal.sql`
5. `0005_kids_favorites_meetup_modes_requests.sql`
6. `0006_multi_photo_multi_color.sql`

## Deploy

```bash
# production (uses linked Vercel project)
npx vercel --prod --yes
```

Public production URL (current): https://swaparound.vercel.app  
Preferred public brand URL: `sandlot.unitedundergod.org` (attach in Vercel Domains when DNS is ready).

## Safety doctrine

- **Parents only** have accounts; children do not.
- Meetups and swaps are **in person** and **supervised**.
- COPPA-minded: collect the minimum; never sell data; never advertise to kids.
- Report / block tools are first-class.

## Ecosystem

Part of the United Under God / Life Produces Life portfolio. Sibling connection products:

- **Kindred** — adult friendship around purpose  
- **Aligned Souls** — dating companions for becoming  
- **Sandlot** — kids play, toy exchange, family meetups  
