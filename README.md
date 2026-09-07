# LineEdge

A platform for finding the best-value moneylines and player props across NBA, NFL, MLB, and
soccer (EPL, Bundesliga, Serie A, UEFA Champions/Europa/Conference League, international), plus
a bankroll-challenge mode ("$10 → $1000 at +100 odds") that suggests sized bets to hit a goal.

## How it works

1. **Scan.** Each morning (or on demand from the dashboard), a scan pulls today's games, current
   odds, and each team/player's recent historical performance.
2. **Model.** For every game/prop offered, the value engine computes a *modeled* win/hit
   probability from history and compares it to the *implied* probability baked into the bookmaker's
   odds. The gap is the edge.
3. **Rank.** Picks are filtered to a "good odds" range (avoids extreme favorites/longshots),
   filtered to a minimum edge and minimum sample-size confidence, then ranked by `edge × confidence`.
4. **Challenges.** Create a bankroll challenge with a start budget, goal, risk level, and target
   odds range. The suggestion engine builds a single bet — or parlays several top picks together —
   to land near your target odds, sizes the stake as a percentage of your current bankroll, and
   tracks the bankroll curve as you record wins/losses.

## Data: mock provider vs. a real feed

**There's no bundled API key for live odds or stats**, so this ships with `ODDS_PROVIDER=mock`: a
deterministic synthetic-data generator (`src/lib/providers/mockProvider.ts`) that invents a
realistic slate — teams, rosters, historical box scores, today's games, moneylines, and player
prop lines — so the entire pipeline (scan → model → rank → challenge suggestions) runs end-to-end
with zero setup. It's reseeded once per calendar day, so "running the morning scan" behaves like
the real thing. Player names are synthetic; team/league names are real for authenticity.

### Why you can't just point it at FanDuel or DraftKings

Those sites don't have a public odds API, they actively block scraping, and pulling data from
them programmatically violates their Terms of Service. The legitimate route is an **odds
aggregator** that has commercial agreements with the books and republishes their real-time lines —
that's what's wired up here.

### Going live

1. **Real odds** — sign up at [The Odds API](https://the-odds-api.com) (free tier: 500
   requests/month) and grab a key. Set `ODDS_PROVIDER=the-odds-api` and `ODDS_API_KEY=...` in
   `.env`. `src/lib/providers/theOddsApiProvider.ts` then pulls real moneylines for every league
   in the catalog, **shopping across every US book in the response** (DraftKings, FanDuel, BetMGM,
   Caesars, etc.) and using whichever price is best for the bettor on each side — the same
   "shop for the best odds" behavior a serious bettor does manually.
   - Player props aren't fetched: The Odds API only exposes those on paid plans, via a separate
     per-event endpoint. See the comment at the top of `theOddsApiProvider.ts` for where to add it.
2. **Real history** (needed for the moneyline model — odds feeds don't include this) — sign up at
   [api-sports.io](https://api-sports.io), set `STATS_PROVIDER=api-sports` and
   `API_SPORTS_KEY=...`. `src/lib/statsProviders/apiSportsProvider.ts` backfills each team's
   recent-games history from api-sports' soccer/basketball/NFL/baseball products.
   - **Confidence note:** the soccer mapping (api-football) matches that API's long-stable,
     well-documented shape closely. The NBA/NFL/MLB sibling APIs follow the same general
     conventions but their exact score/winner field names are handled defensively with fallbacks
     rather than verified against live responses (this was built without network access to
     api-sports.io). If a sport comes back with no history, open that sport's page on your
     api-sports dashboard — it shows a live example response for your key — and adjust
     `mapGameToLog()` to match.
   - Without this set, real-provider games still show up but at low confidence (see
     `valueEngine.ts`) rather than faking a probability from nothing.
   - Player history isn't fetched yet either, for the same reason props aren't: nothing to model
     it against until the props side above is built.

Everything downstream (the value engine, the dashboard, challenges) is provider-agnostic — it
only depends on the `OddsProvider` interface in `src/lib/providers/types.ts`, so a different odds
or stats source is a new file, not a rewrite.

## Tuning

Environment variables (see `.env.example`):

- `GOOD_ODDS_MIN` / `GOOD_ODDS_MAX` — American odds range picks must fall within.
- `MIN_EDGE` — minimum modeled-probability edge over the implied probability to surface a pick.

## Stack

Next.js 14 (App Router) + TypeScript, Prisma + SQLite, Tailwind CSS, Recharts.

## Getting started

```bash
npm install
cp .env.example .env
npx prisma db push      # creates dev.db
npm run db:seed         # runs an initial scan so the dashboard has data
npm run dev
```

Open http://localhost:3000. Click **Run morning scan** any time to pull a fresh slate (the mock
provider reseeds daily; running it again same-day repeats the same slate).

### Scripts

- `npm run dev` / `npm run build` / `npm run start` — standard Next.js
- `npm run scan` — run the scan from the CLI (point a cron job / GitHub Action / Vercel Cron at
  this each morning instead of clicking the button)
- `npm run db:seed` — same as `scan`, wired up as the Prisma seed command
- `npm run typecheck` — `tsc --noEmit`

## Project layout

```
prisma/schema.prisma          data model (catalog, historical logs, snapshots, picks, challenges)
src/lib/providers/            OddsProvider interface + mock and The Odds API implementations
src/lib/statsProviders/       api-sports.io team-history backfill, composed onto a real provider
src/lib/valueEngine.ts        modeled probability, edge, and ranking
src/lib/scan.ts               ingests a provider's daily data into the DB and runs the value engine
src/lib/challengeEngine.ts    bet-sizing and parlay-building for bankroll challenges
src/app/                      dashboard (best picks) and challenges UI + API routes
```

## Known limitations

- Mock data means the *shape* of the pipeline is real but today's actual "best picks" are
  synthetic until a real odds + stats feed is wired in (see above).
- Real-provider player props aren't fetched yet (needs a paid The Odds API plan) — only real
  moneylines are live-data-ready out of the box.
- The NBA/NFL/MLB legs of the stats provider are best-effort and may need a small field-name
  fix once you can see a live response for your api-sports key (soccer is solid).
- Bet outcomes in a challenge are recorded manually (Won/Lost/Push) — there's no live score
  feed wired up to auto-settle bets yet.
- `next@14.2.x` has one known low-impact advisory in a nested build-time dependency (PostCSS,
  used only for our own trusted CSS at build time) that's only fully resolved by a Next 16
  major-version upgrade; left as-is to avoid an unrelated breaking change.
