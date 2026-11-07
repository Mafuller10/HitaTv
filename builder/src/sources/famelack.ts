// Famelack — live TV, internet radio and webcams from Famelack's own public dataset
// (https://github.com/famelack/famelack-data, MIT licence). No scraping: these are static JSON files.
//   TV      → plays in HitaTV (channels already supplied by iptv-org are skipped as duplicates)
//   Radio   → plays in HitaTV (Roku Audio node)
//   Webcams → YouTube embeds, so they open in the official YouTube channel on the Roku
import { config } from "../config.js";
import { normalizeGenres, percentile } from "../genres.js";
import { probeAudio, probeStream } from "../healthcheck.js";
import type { Item } from "../types.js";
import { fetchJson, pool } from "../util/http.js";

interface Entry {
  nanoid: string;
  name: string;
  sources: { streams?: string[]; youtube?: string[] };
  languages?: string[];
  country: string;
  isGeoBlocked?: boolean;
}

const COUNTRY_NAMES: Record<string, string> = { us: "the USA", gb: "the UK", ca: "Canada", au: "Australia" };
const COUNTRY_CODES: Record<string, string> = { us: "US", gb: "GB", ca: "CA", au: "AU" };

const normUrl = (u: string) => u.toLowerCase().replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
const normName = (n: string) => n.toLowerCase().replace(/\b(hd|tv|channel)\b/g, "").replace(/[^a-z0-9]/g, "");
const label = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** nanoid → category names, from the dataset's per-category files. */
async function categoryIndex(kind: "tv" | "radio" | "webcams", cats: string[]): Promise<Map<string, string[]>> {
  const idx = new Map<string, string[]>();
  await pool(cats, 6, async (cat) => {
    const list = await fetchJson<Entry[]>(`${config.famelack.raw}/${kind}/raw/categories/${cat}.json`);
    for (const e of list) idx.set(e.nanoid, [...(idx.get(e.nanoid) ?? []), cat]);
  });
  return idx;
}

async function countryEntries(kind: "tv" | "radio" | "webcams"): Promise<Entry[]> {
  const lists = await pool(config.famelack.countries, 4, (cc) =>
    fetchJson<Entry[]>(`${config.famelack.raw}/${kind}/raw/countries/${cc}.json`),
  );
  return lists.flatMap((l) => l ?? []).filter((e) => !e.isGeoBlocked);
}

export async function fetchFamelack(quick: boolean, existing: Item[]): Promise<Item[]> {
  const [tv, radio, cams] = await Promise.all([
    fetchTv(quick, existing).catch((e) => (console.warn(`[famelack] tv failed: ${e}`), [] as Item[])),
    fetchRadio(quick).catch((e) => (console.warn(`[famelack] radio failed: ${e}`), [] as Item[])),
    fetchWebcams(quick).catch((e) => (console.warn(`[famelack] webcams failed: ${e}`), [] as Item[])),
  ]);
  console.log(`[famelack] ${tv.length} TV channels, ${radio.length} radio stations, ${cams.length} webcams`);
  return [...tv, ...radio, ...cams];
}

// ---------------------------------------------------------------- TV

async function fetchTv(quick: boolean, existing: Item[]): Promise<Item[]> {
  const cfg = config.famelack;
  const [entries, cats] = await Promise.all([countryEntries("tv"), categoryIndex("tv", cfg.tvCategories)]);

  // Skip channels iptv-org already gave us (same stream URL, or same name in the same country).
  const seenUrls = new Set(existing.flatMap((i) => i.streams ?? []).map((s) => normUrl(s.url)));
  const seenNames = new Set(existing.filter((i) => i.type === "live").map((i) => `${i.country}|${normName(i.title)}`));

  const order = cfg.countries;
  const candidates = entries
    .filter((e) => e.sources.streams?.length)
    .filter((e) => !e.sources.streams!.some((u) => seenUrls.has(normUrl(u))))
    .filter((e) => !seenNames.has(`${COUNTRY_CODES[e.country] ?? e.country.toUpperCase()}|${normName(e.name)}`))
    .map((e, i) => ({ e, score: (order.length - order.indexOf(e.country)) * 10 + (cats.get(e.nanoid)?.length ?? 0) - i / 10000 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, quick ? 60 : cfg.maxTvCandidates);

  console.log(`[famelack] probing ${candidates.length} new TV channels…`);
  const probed = await pool(candidates, 30, async ({ e, score }) => {
    const ok: NonNullable<Item["streams"]> = [];
    for (const url of e.sources.streams!.slice(0, 3)) {
      if (/\.mpd(\?|$)/i.test(url)) continue;
      if (await probeStream(url)) ok.push({ url, format: /\.mp4(\?|$)/i.test(url) ? "mp4" : "hls" });
      if (ok.length >= 2) break;
    }
    return ok.length ? { e, ok, score } : null;
  });

  const items: (Item & { _s: number })[] = probed
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, quick ? 30 : cfg.maxTv)
    .map(({ e, ok, score }) => {
      const c = cats.get(e.nanoid) ?? ["general"];
      return {
        id: `famelack:${e.nanoid}`,
        source: "famelack",
        type: "live",
        title: e.name,
        description: `Live ${c.map(label).join(", ").toLowerCase()} channel from ${COUNTRY_NAMES[e.country] ?? e.country.toUpperCase()}, listed on Famelack.`,
        poster: "",
        backdrop: "",
        genres: normalizeGenres(c),
        year: null,
        country: COUNTRY_CODES[e.country] ?? e.country.toUpperCase(),
        language: e.languages?.[0] ?? null,
        durationSec: null,
        rating: null,
        playable: true,
        streams: ok,
        popularity: 0,
        _s: score,
      };
    });
  percentile(items, (i) => i._s, (i, p) => (i.popularity = p));
  return items.map(({ _s, ...i }) => i);
}

// ---------------------------------------------------------------- Radio

async function fetchRadio(quick: boolean): Promise<Item[]> {
  const cfg = config.famelack;
  const [entries, cats] = await Promise.all([countryEntries("radio"), categoryIndex("radio", cfg.radioCategories)]);

  // Only stations that are in at least one of our categories, spread across categories.
  const byCat = new Map<string, Entry[]>();
  for (const e of entries) {
    const c = cats.get(e.nanoid)?.[0];
    if (!c || !e.sources.streams?.length) continue;
    byCat.set(c, [...(byCat.get(c) ?? []), e]);
  }
  const max = quick ? 40 : cfg.maxRadioCandidates;
  const candidates: Entry[] = [];
  for (let i = 0; candidates.length < max && [...byCat.values()].some((l) => i < l.length); i++)
    for (const l of byCat.values()) if (i < l.length && candidates.length < max) candidates.push(l[i]);

  console.log(`[famelack] probing ${candidates.length} radio stations…`);
  const probed = await pool(candidates, 30, async (e) => {
    for (const url of e.sources.streams!.slice(0, 2)) {
      const fmt = await probeAudio(url);
      if (fmt) return { e, url, fmt };
    }
    return null;
  });

  const items: Item[] = probed
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, quick ? 20 : cfg.maxRadio)
    .map(({ e, url, fmt }, i, all) => {
      const c = cats.get(e.nanoid) ?? [];
      const talk = c.some((x) => ["news", "talk", "sports"].includes(x));
      return {
        id: `famelack:${e.nanoid}`,
        source: "famelack",
        type: "radio",
        title: e.name,
        description: `${c.map(label).join(", ")} radio from ${COUNTRY_NAMES[e.country] ?? e.country.toUpperCase()}, listed on Famelack.`,
        poster: "",
        backdrop: "",
        genres: ["radio", talk ? "news" : "music", ...c.filter((x) => !["news", "talk", "sports"].includes(x))].slice(0, 4),
        year: null,
        country: COUNTRY_CODES[e.country] ?? e.country.toUpperCase(),
        language: e.languages?.[0] ?? null,
        durationSec: null,
        rating: null,
        playable: true,
        streams: [{ url, format: fmt }],
        popularity: 1 - i / Math.max(1, all.length - 1),
      };
    });
  return items;
}

// ---------------------------------------------------------------- Webcams (YouTube)

async function fetchWebcams(quick: boolean): Promise<Item[]> {
  const cfg = config.famelack;
  const [entries, cats] = await Promise.all([countryEntries("webcams"), categoryIndex("webcams", cfg.webcamCategories)]);
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const c = cats.get(e.nanoid);
    if (!c) continue; // keep the scenic categories; skips most traffic/construction cams
    const vid = e.sources.youtube?.map((u) => u.match(/(?:embed\/|v=|youtu\.be\/)([\w-]{11})/)?.[1]).find(Boolean);
    if (!vid || seen.has(vid)) continue;
    seen.add(vid);
    items.push({
      id: `famelack:${e.nanoid}`,
      source: "famelack",
      type: "webcam",
      title: e.name,
      description: `Live ${c.map(label).join(", ").toLowerCase()} webcam in ${COUNTRY_NAMES[e.country] ?? e.country.toUpperCase()}, listed on Famelack. Opens in the YouTube app.`,
      poster: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      backdrop: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      genres: ["webcam", ...c].slice(0, 4),
      year: null,
      country: COUNTRY_CODES[e.country] ?? e.country.toUpperCase(),
      language: null,
      durationSec: null,
      rating: null,
      playable: false,
      external: { appName: cfg.youtubeAppName, contentId: vid, mediaType: "live", webUrl: `https://www.youtube.com/watch?v=${vid}` },
      popularity: 0,
    });
    if (items.length >= (quick ? 20 : cfg.maxWebcams)) break;
  }
  const n = items.length;
  items.forEach((it, i) => (it.popularity = n > 1 ? 1 - i / (n - 1) : 0.5));
  return items;
}
