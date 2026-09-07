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

To go live:

1. Get an API key from a provider such as [The Odds API](https://the-odds-api.com).
2. Set `ODDS_PROVIDER=the-odds-api` and `ODDS_API_KEY=...` in `.env`.
3. `src/lib/providers/theOddsApiProvider.ts` already fetches real moneylines for every league in
   the catalog. **Odds feeds don't include historical stats** — to power the modeled-probability
   side of the engine for real games, wire up a stats source (SportsDataIO, Sportradar, or your
   own box-score pipeline) that populates `TeamGameLog` / `PlayerGameLog` the same way the mock
   provider does. Until then, real-provider games show up with low confidence rather than a
   fabricated probability.
4. Player props aren't in The Odds API's base tier — see the comment in `theOddsApiProvider.ts`
   for the endpoint to extend once you're on a plan that includes them.

Everything downstream (the value engine, the dashboard, challenges) is provider-agnostic — it
only depends on the `OddsProvider` interface in `src/lib/providers/types.ts`.

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
src/lib/valueEngine.ts        modeled probability, edge, and ranking
src/lib/scan.ts               ingests a provider's daily data into the DB and runs the value engine
src/lib/challengeEngine.ts    bet-sizing and parlay-building for bankroll challenges
src/app/                      dashboard (best picks) and challenges UI + API routes
```

## Known limitations

- Mock data means the *shape* of the pipeline is real but today's actual "best picks" are
  synthetic until a real odds + stats feed is wired in (see above).
- Bet outcomes in a challenge are recorded manually (Won/Lost/Push) — there's no live score
  feed wired up to auto-settle bets yet.
- `next@14.2.x` has one known low-impact advisory in a nested build-time dependency (PostCSS,
  used only for our own trusted CSS at build time) that's only fully resolved by a Next 16
  major-version upgrade; left as-is to avoid an unrelated breaking change.
