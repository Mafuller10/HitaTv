// Live TV from the open iptv-org database (the same upstream Famelack uses).
// https://github.com/iptv-org/api — public JSON, no scraping needed.
import { config } from "../config.js";
import { clip, normalizeGenres, percentile } from "../genres.js";
import { probeStream } from "../healthcheck.js";
import type { Item } from "../types.js";
import { fetchJson, pool } from "../util/http.js";

interface Channel {
  id: string;
  name: string;
  network: string | null;
  country: string;
  categories: string[];
  is_nsfw: boolean;
  closed: string | null;
  replaced_by: string | null;
  website: string | null;
}
interface Stream {
  channel: string | null;
  feed: string | null;
  title: string;
  url: string;
  quality: string | null;
  labels?: string[];
  user_agent: string | null;
  referrer: string | null;
}
interface Logo {
  channel: string;
  feed: string | null;
  in_use: boolean;
  width: number;
  height: number;
  url: string;
}
interface Country {
  code: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
}

function streamFormat(url: string): "hls" | "mp4" | null {
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".mpd")) return null;
  if (u.endsWith(".mp4")) return "mp4";
  return "hls"; // iptv-org streams are overwhelmingly HLS, with or without the .m3u8 suffix
}

const qualityNum = (q: string | null) => (q ? parseInt(q, 10) || 0 : 0);

export async function fetchIptv(quick: boolean): Promise<Item[]> {
  const { api, preferredCountries } = config.iptv;
  const maxCandidates = quick ? 120 : config.iptv.maxCandidates;
  const maxChannels = quick ? 60 : config.iptv.maxChannels;

  const [channels, streams, logos, countries, categories] = await Promise.all([
    fetchJson<Channel[]>(`${api}/channels.json`),
    fetchJson<Stream[]>(`${api}/streams.json`),
    fetchJson<Logo[]>(`${api}/logos.json`),
    fetchJson<Country[]>(`${api}/countries.json`),
    fetchJson<Category[]>(`${api}/categories.json`),
  ]);
  console.log(`[iptv] ${channels.length} channels, ${streams.length} streams`);

  const countryName = new Map(countries.map((c) => [c.code, c.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const logoFor = new Map<string, Logo>();
  for (const l of logos) {
    if (l.feed || !l.in_use) continue;
    const cur = logoFor.get(l.channel);
    if (!cur || l.width > cur.width) logoFor.set(l.channel, l);
  }

  const byChannel = new Map<string, Stream[]>();
  for (const s of streams) {
    if (!s.channel) continue;
    if (s.labels?.some((l) => /geo-blocked/i.test(l))) continue;
    if (!streamFormat(s.url)) continue;
    const list = byChannel.get(s.channel) ?? [];
    list.push(s);
    byChannel.set(s.channel, list);
  }

  const pref = new Set(preferredCountries);
  const candidates = channels
    .filter((c) => !c.is_nsfw && !c.closed && !c.replaced_by && byChannel.has(c.id))
    .filter((c) => !c.categories.includes("xxx"))
    .map((c) => {
      const s = byChannel.get(c.id)!.sort((a, b) => qualityNum(b.quality) - qualityNum(a.quality));
      const score =
        (pref.has(c.country) ? 4 : 0) +
        (logoFor.has(c.id) ? 1 : 0) +
        Math.min(qualityNum(s[0].quality), 1080) / 1080 +
        (c.network ? 0.5 : 0);
      return { c, s, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates);

  console.log(`[iptv] probing ${candidates.length} channels…`);
  const probed = await pool(
    candidates,
    30,
    async ({ c, s, score }) => {
      const ok: Item["streams"] = [];
      for (const st of s.slice(0, 3)) {
        const headers: string[] = [];
        if (st.user_agent) headers.push(`User-Agent: ${st.user_agent}`);
        if (st.referrer) headers.push(`Referer: ${st.referrer}`);
        if (await probeStream(st.url, headers)) {
          ok.push({ url: st.url, format: streamFormat(st.url)!, ...(headers.length ? { headers } : {}) });
          if (ok.length >= 2) break;
        }
      }
      return ok.length ? { c, ok, score } : null;
    },
    (d, t) => process.stdout.write(`\r[iptv] probed ${d}/${t}`),
  );
  process.stdout.write("\n");

  const live = probed.filter((x): x is NonNullable<typeof x> => !!x).slice(0, maxChannels);
  const items: (Item & { _score: number })[] = live.map(({ c, ok, score }) => {
    const cats = c.categories.map((id) => categoryName.get(id) ?? id);
    const country = countryName.get(c.country) ?? c.country;
    const logo = logoFor.get(c.id)?.url ?? "";
    return {
      id: `iptv:${c.id}`,
      source: "iptv",
      type: "live",
      title: c.name,
      description: clip(
        `Live ${cats.join(", ").toLowerCase() || "TV"} channel from ${country}.` +
          (c.network ? ` Part of ${c.network}.` : ""),
      ),
      poster: logo,
      backdrop: "",
      genres: normalizeGenres(c.categories.length ? c.categories : ["general"]),
      year: null,
      country: c.country,
      language: null,
      durationSec: null,
      rating: null,
      playable: true,
      streams: ok,
      popularity: 0,
      _score: score,
    };
  });
  percentile(items, (i) => i._score, (i, p) => (i.popularity = p));
  console.log(`[iptv] ${items.length} live channels passed health check`);
  return items.map(({ _score, ...i }) => i);
}
