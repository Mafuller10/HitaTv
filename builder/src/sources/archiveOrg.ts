// Public-domain films, cartoons and TV from the Internet Archive (open API, plays in-app).
// Search: https://archive.org/advancedsearch.php   Files: https://archive.org/metadata/{id}
import { config } from "../config.js";
import { clip, inferGenres, isBlocked, normalizeGenres, percentile } from "../genres.js";
import type { Item } from "../types.js";
import { DiskCache } from "../util/cache.js";
import { fetchJson, pool } from "../util/http.js";

interface SearchDoc {
  identifier: string;
  title?: string | string[];
  description?: string | string[];
  subject?: string | string[];
  year?: number | string;
  downloads?: number;
  language?: string | string[];
}
interface MetaFile {
  name: string;
  format?: string;
  length?: string;
  size?: string;
}

const arr = (v: string | string[] | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const first = (v: string | string[] | undefined) => arr(v)[0] ?? "";

function parseLength(len: string | undefined): number {
  if (!len) return 0;
  if (len.includes(":")) return len.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
  return Number(len) || 0;
}

/** Pick the longest h.264 rendition (falls back to 512Kb MPEG4). */
function pickVideo(files: MetaFile[]): { name: string; seconds: number } | null {
  const mp4s = files
    .filter((f) => /\.mp4$/i.test(f.name))
    .map((f) => ({ name: f.name, seconds: parseLength(f.length), low: /512kb/i.test(f.name + (f.format ?? "")) }));
  if (!mp4s.length) return null;
  mp4s.sort((a, b) => b.seconds - a.seconds || Number(a.low) - Number(b.low));
  const best = mp4s[0];
  // Prefer the full-quality file of (nearly) the same length.
  const hq = mp4s.find((m) => !m.low && Math.abs(m.seconds - best.seconds) < 5);
  return hq ?? best;
}

export async function fetchArchive(quick: boolean): Promise<Item[]> {
  const cfg = config.archive;
  const perCollection = quick ? 25 : cfg.perCollection;
  const fileCache = new DiskCache<{ name: string; seconds: number } | null>("archive-files", 30 * 864e5);

  const seen = new Set<string>();
  const items: (Item & { _dl: number })[] = [];

  for (const col of cfg.collections) {
    const q = `collection:${col.id} AND mediatype:movies AND format:(MPEG4 OR "h.264") AND downloads:[${cfg.minDownloads} TO *]`;
    const params = new URLSearchParams({ q, rows: String(Math.ceil(perCollection * 1.6)), output: "json" });
    for (const f of ["identifier", "title", "description", "subject", "year", "downloads", "language"])
      params.append("fl[]", f);
    params.append("sort[]", "downloads desc");
    const res = await fetchJson<{ response: { docs: SearchDoc[] } }>(
      `https://archive.org/advancedsearch.php?${params}`,
    );
    const docs = res.response.docs.filter(
      (d) =>
        !seen.has(d.identifier) &&
        !isBlocked(first(d.title), arr(d.subject), first(d.description).slice(0, 600)),
    );

    const withFiles = await pool(docs, 8, async (d) => {
      let v = fileCache.get(d.identifier);
      if (v === undefined) {
        const meta = await fetchJson<{ files?: MetaFile[] }>(`https://archive.org/metadata/${d.identifier}`);
        v = pickVideo(meta.files ?? []);
        fileCache.set(d.identifier, v);
      }
      return v ? { d, v } : null;
    });
    fileCache.save();

    const minDur = ("minDurationSec" in col ? col.minDurationSec : undefined) ?? cfg.minDurationSec;
    let added = 0;
    for (const x of withFiles) {
      if (!x || added >= perCollection) continue;
      const { d, v } = x;
      if (v.seconds && v.seconds < minDur) continue;
      seen.add(d.identifier);
      added++;
      const year = Number(String(d.year ?? "").slice(0, 4)) || null;
      items.push({
        id: `archive:${d.identifier}`,
        source: "archive",
        type: col.type,
        title: clip(first(d.title), 80) || d.identifier,
        description: clip(first(d.description)),
        poster: `https://archive.org/services/img/${d.identifier}`,
        backdrop: "",
        genres: (() => {
          const g = normalizeGenres(arr(d.subject), col.extraGenres);
          return g.length >= 2 ? g : normalizeGenres([...g, ...inferGenres(first(d.title), first(d.description))]);
        })(),
        year,
        country: null,
        language: first(d.language) || null,
        durationSec: v.seconds ? Math.round(v.seconds) : null,
        rating: null,
        playable: true,
        streams: [
          {
            url: `https://archive.org/download/${d.identifier}/${v.name.split("/").map(encodeURIComponent).join("/")}`,
            format: "mp4",
          },
        ],
        popularity: 0,
        _dl: d.downloads ?? 0,
      });
    }
    console.log(`[archive] ${col.id}: ${added} items`);
  }

  percentile(items, (i) => i._dl, (i, p) => (i.popularity = p));
  return items.map(({ _dl, ...i }) => i);
}
