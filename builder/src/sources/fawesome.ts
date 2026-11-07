// Fawesome (Future Today) — METADATA ONLY. Titles, posters and genres come from the public sitemap and
// each title page's schema.org JSON-LD. Video streams are never fetched: pressing play on the Roku opens
// the official Fawesome channel (or shows the web URL). robots.txt allows these paths (/v1, /v2 untouched).
import { config } from "../config.js";
import { clip, inferGenres, isBlocked, normalizeGenres, percentile } from "../genres.js";
import type { Item } from "../types.js";
import { DiskCache } from "../util/cache.js";
import { decodeEntities, fetchText, pool, sleep } from "../util/http.js";

interface SitemapEntry {
  url: string;
  numericId: string;
  title?: string;
  description?: string;
  duration?: number;
  thumb?: string;
}

interface Detail {
  title: string;
  description: string;
  image: string;
  genres: string[];
  year: number | null;
  rating: string | null;
  durationSec: number | null;
}

function parseSitemap(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  for (const block of xml.split("<url>").slice(1)) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    const m = loc?.match(/fawesome\.tv\/(?:movies|shows)\/(\d+)\//);
    if (!loc || !m) continue;
    const tag = (t: string) => {
      const v = block.match(new RegExp(`<video:${t}>([\\s\\S]*?)</video:${t}>`))?.[1];
      return v ? decodeEntities(v) : undefined;
    };
    out.push({
      url: loc,
      numericId: m[1],
      title: tag("title"),
      description: tag("description"),
      duration: Number(tag("duration")) || undefined,
      thumb: tag("thumbnail_loc"),
    });
  }
  return out;
}

function isoDuration(d: string | undefined): number | null {
  const m = d?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) || null;
}

async function fetchDetail(url: string): Promise<Detail | null> {
  const html = await fetchText(url, { headers: { Accept: "text/html" } });
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const t = String(j["@type"] ?? "");
    if (!/^(Movie|TVSeries|TVSeason|CreativeWorkSeries|VideoObject)$/.test(t) || t === "VideoObject") continue;
    const genre = j.genre;
    const date = String(j.datePublished ?? j.startDate ?? "");
    return {
      title: decodeEntities(String(j.name ?? "")),
      description: decodeEntities(String(j.description ?? "")),
      image: String(Array.isArray(j.image) ? j.image[0] : (j.image ?? "")),
      genres: Array.isArray(genre) ? genre.map(String) : genre ? [String(genre)] : [],
      year: Number(date.slice(0, 4)) || null,
      rating: j.contentRating ? String(j.contentRating) : null,
      durationSec: isoDuration(j.duration as string | undefined),
    };
  }
  // Fall back to OpenGraph tags (some show pages have no JSON-LD).
  const og = (p: string) => html.match(new RegExp(`<meta property="og:${p}" content="([^"]*)"`))?.[1];
  const title = og("title")?.replace(/^Watch\s+/i, "").replace(/\s+(Full Movie|Full Episodes?)?\s*Free Online.*$/i, "");
  return title
    ? { title: decodeEntities(title), description: decodeEntities(og("description") ?? ""), image: og("image") ?? "", genres: [], year: null, rating: null, durationSec: null }
    : null;
}

export async function fetchFawesome(quick: boolean): Promise<Item[]> {
  const cfg = config.fawesome;
  const limits = { movie: quick ? 40 : cfg.maxMovies, series: quick ? 15 : cfg.maxShows };
  const cache = new DiskCache<Detail | null>("fawesome-detail", 14 * 864e5);
  const items: Item[] = [];

  for (const type of ["movie", "series"] as const) {
    const entries: SitemapEntry[] = [];
    for (const sm of cfg.sitemaps[type]) entries.push(...parseSitemap(await fetchText(sm)));
    const picked = entries.filter((e) => !isBlocked(e.title, e.description)).slice(0, limits[type]);
    console.log(`[fawesome] ${type}: ${entries.length} in sitemap, fetching ${picked.length} detail pages`);

    const details = await pool(
      picked,
      cfg.detailConcurrency,
      async (e) => {
        let d = cache.get(e.url);
        if (d === undefined) {
          d = await fetchDetail(e.url).catch(() => null);
          cache.set(e.url, d);
          await sleep(cfg.detailDelayMs);
        }
        return d;
      },
      (d, t) => process.stdout.write(`\r[fawesome] ${type} details ${d}/${t}`),
    );
    process.stdout.write("\n");
    cache.save();

    const typed: Item[] = [];
    picked.forEach((e, i) => {
      const d = details[i];
      const title = (d?.title || e.title)?.replace(/\s*[-–|]\s*(TV Series|Full Movie|Series|Web Series)\s*$/i, "");
      if (!title) return;
      if (d?.rating && /^(X|NC-17|TV-MA)$/i.test(d.rating)) return;
      if (isBlocked(title, d?.description, d?.genres)) return;
      typed.push({
        id: `fawesome:${e.numericId}`,
        source: "fawesome",
        type,
        title: clip(title, 80),
        description: clip(d?.description || e.description),
        poster: e.thumb || d?.image || "",
        backdrop: d?.image || "",
        genres: (() => {
          const g = normalizeGenres(d?.genres ?? []);
          return g.length ? g : [...inferGenres(title, d?.description || e.description), type === "series" ? "series" : "movies"];
        })(),
        year: d?.year ?? null,
        country: null,
        language: null,
        durationSec: e.duration ?? d?.durationSec ?? null,
        rating: d?.rating ?? null,
        playable: false,
        external: { appName: cfg.appName, contentId: e.numericId, mediaType: type, webUrl: e.url },
        popularity: 0,
      });
    });
    // Sitemap order is the site's own ordering; earlier = more prominent.
    const rank = new Map(typed.map((t, i) => [t.id, typed.length - i]));
    percentile(typed, (t) => rank.get(t.id)!, (t, p) => (t.popularity = p));
    items.push(...typed);
  }
  console.log(`[fawesome] ${items.length} titles`);
  return items;
}
