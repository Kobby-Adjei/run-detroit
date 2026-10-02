# Run Detroit

An interactive, mobile-first concept prototype for the Detroit Pistons: play basketball at a
neighborhood court, explore the city, and earn Pistons Points — inside the app fans already have.

**Live: https://run-detroit.vercel.app**

The pitch deck that goes with it is in [`deck/run-detroit-pitch.pptx`](deck/run-detroit-pitch.pptx) — nine slides covering the problem, the fan journey, the pilot and its point policy, the verification model and the ask.

Run it locally with `python3 -m http.server 8000`, or open `index.html` directly (accounts and
map tiles need a network connection).

## What's real

| Layer | Source |
|---|---|
| Court coordinates | OpenStreetMap basketball pitches inside the City of Detroit |
| Neighborhoods & ZIPs | Nominatim reverse geocoding of those coordinates |
| Interactive map | Leaflet 1.9.4 (vendored) over Esri Light/Dark Gray Canvas and World Imagery |
| Court photography | Esri World Imagery aerials captured at each court's real coordinates |
| Detroit skyline | *Detroit Skyline* (CC0), Wikimedia Commons |
| UI icons | Phosphor Icons 2.1.1 (MIT), inlined as an SVG sprite — no emoji, no icon fonts |
| Badges & brand mark | Purpose-drawn SVG |

Distances in the app are computed with the haversine formula from a fixed Midtown Detroit
position to each court's real latitude/longitude.

## Accounts

Players get a real account backed by Supabase Postgres.

- **Start playing** creates an anonymous guest account in one tap — no email, no password.
- **Continue with email** sends a six-digit code and creates a permanent account.
- A guest can add an email later from the **You** tab and keep everything already earned.

Progress (points, streak, check-in, weekly result, 313 stops) writes to `player_state` on a
450 ms debounce and reloads on every sign-in, so a player picks up where they left off on any
device. Check-ins, completed challenges and city stops are appended to `check_ins`.

| Table | Holds |
|---|---|
| `profiles` | display name, home court, created date |
| `player_state` | points, streak, weeks active, current check-in, weekly result, 313 stops |
| `check_ins` | an append-only log of every scored action |
| `court_standings` | a view aggregating check-ins per court |

Every table has row-level security: a signed-in player can read and write **only** their own
rows. The publishable key in `config.js` is a browser key by design and grants nothing on its
own. Schema lives in `supabase/migrations/`; apply it with `supabase db push`.

> The default Supabase email sender is rate limited to a few messages per hour. For a live demo,
> use **Start playing** (guest), or attach an SMTP provider in the Supabase dashboard.

## Running it yourself

No build step, no dependencies to install.

```bash
git clone https://github.com/Kobby-Adjei/run-detroit.git
cd run-detroit
python3 -m http.server 8000   # then open http://localhost:8000
```

Accounts and map tiles need a network connection. To point it at your own Supabase project, create
one, run `supabase db push` and `supabase config push` from this folder, then put your project URL
and publishable key in `config.js`.

The key in `config.js` is a browser key by design. Every table is protected by row-level security,
so the key on its own grants access to nothing.

## Deploying

```bash
vercel deploy --prod        # static, no build step
supabase db push            # schema
supabase config push        # auth settings (anonymous sign-in, site URL)
```

After changing the production URL, update `site_url` in `supabase/config.toml` and push again so
email links resolve.

## Alignment with the team brief

| Brief item | In the prototype |
|---|---|
| Screen 1 — Pistons app entry | Fan Zone with Tickets, Rewards, Schedule, Arcade and a Run Detroit card |
| Screen 2 — Run Detroit hub | Home: weekly challenge, your court, season, 313, standings, rewards |
| Screen 3 — Map | Live map, five real Detroit courts, Map/Satellite toggle |
| Screen 4 — Court | Aerial, rank, players, hoops, geofence map, check in |
| Screen 5 — Weekly challenge | Free Throw, 7 of 10, +150 |
| Screen 6 — Verification | Level 1 QR + location, Level 2 court host, Level 3 video marked out of V1 |
| Screen 7 — Success | +150, court contribution, badge progress |
| Screen 8 — Leaderboard | Court standings with capped contributions |
| 313 Challenge | Three real Detroit landmarks with coordinates |
| Badges | Rookie Runner, Hot Hand, Court Hopper, 313 Explorer, Community MVP |
| Four-week calendar | Challenges screen: week, requirement, evidence level, points, weekly cap |
| Connect | Shown as post-pilot, pending moderation and safety review |
| V1 boundaries | No public profiles, no video upload, no real points transfer |

Open items for the team, not decided here: the five pilot courts are real OSM courts in Davison,
Chandler Park, College Park, Russell Woods and Westwood Park rather than the Palmer Park example
in the brief, and the visual fit has not yet been checked against current Pistons app screenshots.

## What's simulated

Pistons sign-in and account handoff · QR scanning · geolocation verification · court-host
confirmation · Pistons Rewards / Uptop API calls · point transfers · free-throw scoring. Nothing
in this prototype reaches a Pistons or Uptop service.

The one thing that *is* real: the demo account. Sign-in, progress and history run against a live
Supabase project so the prototype behaves like a real multi-user app. That is a prototype
convenience, **not** a proposed auth design — the brief's position stands, that production would
sign in through an approved Pistons account handoff.

## The five pilot courts

| # | Court | Neighborhood | Coordinates |
|---|---|---|---|
| 1 | Davison Courts | Davison, 48212 | 42.41498, −83.05244 |
| 2 | Chandler Park | Chandler Park, 48215 | 42.39250, −82.97603 |
| 3 | College Park Courts | College Park, 48235 | 42.42375, −83.19581 |
| 4 | Russell Woods Courts | Russell Woods, 48238 | 42.38863, −83.13303 |
| 5 | Westwood Park | Westwood Park, 48219 | 42.39635, −83.23606 |

## Judge demo path

Fan Zone → Run Detroit → Courts (pan the live map, toggle Map/Satellite) → tap a court →
Scan court code → Start the challenge → Begin attempt (watch the ten shots resolve) →
Submit verified result → Standings → 313 Challenge → Rewards

**Reset demo** lives at the bottom of the You tab.

## Files

```
index.html            shell, iOS-style chrome, SVG icon sprite
styles.css            design system: tokens, motion, components, light + dark
app.js                state, router, view rendering, map, motion, account sheet
sync.js               Supabase accounts and progress sync (window.RD)
config.js             public Supabase URL + publishable key
vercel.json           static hosting config and cache headers
supabase/migrations/  database schema
supabase/config.toml  remote auth settings
assets/               brand mark, badges
assets/photos/        real aerial and skyline photography
assets/vendor/        Leaflet 1.9.4, supabase-js 2.58
```

Basemap tiles and accounts need a network connection. If Supabase is unreachable the app keeps
working from `localStorage`, so the demo never dead-ends.

## Credits

Built by [Kobby Adjei](https://github.com/Kobby-Adjei) as the UX and prototype work for a Detroit
Pistons technology challenge, with Dickson Mogaka (product and strategy), Asher McGhee (community
and challenges) and Quinstella B.P. (research and business).

Court data © OpenStreetMap contributors (ODbL) · Basemap and aerial tiles © Esri ·
Icons: [Phosphor Icons](https://phosphoricons.com) (MIT) · Map: [Leaflet](https://leafletjs.com) (BSD-2) ·
3D: [three.js](https://threejs.org) (MIT) · Skyline photograph: CC0 via Wikimedia Commons.

Run Detroit is an unaffiliated student concept. It is not endorsed by, and carries no data from,
the Detroit Pistons, Uptop or the NBA.

## Design notes

- **Motion.** Staggered view entrance (`cubic-bezier(.16,1,.3,1)`), spring presses, an animated
  shot-by-shot free-throw round, a stroke-drawn verification seal, a counting points roll-up,
  and a canvas confetti burst in Pistons colors.
- **Chrome.** Translucent blurred nav and tab bars, a large title that collapses into the nav bar
  on scroll, and an SF-first type stack.
- **Both themes.** Full light and dark support, including a dark basemap.
- **Accessibility.** `prefers-reduced-motion` disables every animation and shortens timed
  sequences; all interactive targets clear 44 px; icons carry `aria-hidden` with labelled controls.
