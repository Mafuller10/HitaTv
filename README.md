# HitaTV

A Roku channel with a streaming-style browse UI (top nav, hero preview, rows of tiles), category rows, search and on-device recommendations. Content comes from four free sources:

| Source | What it gives | Playback |
|---|---|---|
| **iptv-org** (the open database behind Famelack) | ~600 free live TV channels, health-checked daily | In HitaTV |
| **Internet Archive** | Public-domain feature films, cartoons, classic TV, noir, silent films | In HitaTV |
| **Fawesome** | Movie and series titles, posters, genres (from its public sitemap and title pages) | Opens the official Fawesome channel |
| **RetroCrush** | Classic anime titles (from its public sitemap) | Opens the official RetroCrush channel |

Fawesome and RetroCrush are licensed, ad-supported services, so HitaTV only lists their titles and hands playback to their own apps. It never pulls their video streams. The builder sends a plain identifying User-Agent, respects each site's robots.txt and rate-limits its requests.

## How it fits together

```
builder/  (Node + TypeScript, runs daily in GitHub Actions)
   iptv-org API ─┐
   archive.org ──┼─► normalize ─► health-check streams ─► similar[] ─► rows ─► dist/catalog.json ─► GitHub Pages
   fawesome ─────┤
   retrocrush ───┘
roku/     (BrightScript + SceneGraph)
   CatalogTask downloads catalog.json (falls back to cache, then the bundled copy)
   → Home / Live TV / Movies & Shows / Anime / Search → Details → Player (or open the partner app)
   History (registry) → Recommender → "Continue Watching", "Recommended for You", "Because You Watched…"
```

### Recommendations (on the Roku, `roku/components/lib/Recommender.brs`)
- **Profile:** each title you watch adds weight to its genres and source: `decay × (0.3 + completion) × plays`, with a 14-day half-life. Stopping a title within the first 10% counts against its genres.
- **Score:** `0.6 × cosine(profile, item genres) + 0.25 × popularity + 0.15 × source affinity`. Titles you've finished are excluded.
- **Diversity:** MMR re-ranking keeps any one genre or source from filling the row.
- **More Like This / Because You Watched:** genre Jaccard similarity, type, era and popularity, computed ahead of time by the builder.
- **Cold start:** until you've watched 3 titles, the Trending row (popularity, mixed across sources) stands in.

## Quick start

```powershell
# 1. Build a catalog and bundle it into the channel (quick = small; drop --quick for the full one, ~10 min)
cd builder; npm install; npm run build:quick -- --bundle; cd ..

# 2. Turn on Developer Mode on the Roku: Home x3, Up x2, Right, Left, Right, Left, Right.
#    Set a password and note the IP it shows.

# 3. Sideload
.\deploy.ps1 -RokuIp 192.168.1.50 -Password yourpass

# Debug console (BrightScript errors, print output)
telnet 192.168.1.50 8085
```

### Daily catalog updates (optional, recommended)
1. Push this folder to a GitHub repo named `HitaTv`.
2. In the repo, go to **Settings → Pages → Source: GitHub Actions**.
3. Run the **Build catalog** workflow once. It publishes `https://<user>.github.io/HitaTv/catalog.json`.
4. Put that URL in `roku/manifest` as `catalog_url=` and redeploy. The channel then fetches a fresh catalog on every launch, falling back to the cached copy and then the bundled one.

## Partner-channel launch
"Open in Fawesome" / "Open in RetroCrush" finds the installed channel through the Roku's local control API (`/query/apps`) and launches it. If the channel isn't installed, or the TV blocks local control, HitaTV shows the web link instead. To allow it, go to **Settings → System → Advanced system settings → Control by mobile apps → Network access → Permissive** (or Default).

## Tuning
- `builder/src/config.ts` controls preferred countries for live TV, channel/title limits, Archive collections and the content filter.
- `builder/src/rows.ts` controls which category rows exist and which tabs they appear on.
- `roku/images/` holds the icons and splash screens; regenerate them with `node tools/make-images.mjs`, or replace them with your own art at the same sizes.

## Notes
- Live streams in iptv-org come from third parties and can go offline at any time. The daily health check drops dead ones, and the player tries a backup URL before showing an error.
- Android TV isn't built yet. `catalog.json` doesn't depend on the platform, so an Android TV client (Kotlin + Compose for TV + Media3) could reuse it unchanged.
