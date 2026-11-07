import { config } from "./config.js";
import type { Item, Row } from "./types.js";

type View = Row["views"][number];
const MIN_ROW = 4;
const PER_ROW = 40;

const byPop = (a: Item, b: Item) => b.popularity - a.popularity;

function row(id: string, title: string, views: View[], items: Item[], limit = PER_ROW): Row | null {
  const ids = [...new Set([...items].sort(byPop).map((i) => i.id))].slice(0, limit);
  return ids.length >= MIN_ROW ? { id, title, views, itemIds: ids } : null;
}

/** Interleave lists so one source can't dominate a row. */
function roundRobin(lists: Item[][], limit: number): Item[] {
  const sorted = lists.map((l) => [...l].sort(byPop));
  const out: Item[] = [];
  for (let i = 0; out.length < limit && sorted.some((l) => i < l.length); i++)
    for (const l of sorted) if (i < l.length && out.length < limit) out.push(l[i]);
  return out;
}

export function buildRows(items: Item[]): Row[] {
  const has = (i: Item, g: string) => i.genres.includes(g);
  const live = items.filter((i) => i.type === "live");
  const radio = items.filter((i) => i.type === "radio");
  const cams = items.filter((i) => i.type === "webcam");
  const vod = items.filter((i) => i.type === "movie" || i.type === "series");
  const bySource = (s: Item["source"]) => vod.filter((i) => i.source === s);
  const archive = bySource("archive");
  const fawesome = bySource("fawesome");
  const retro = bySource("retrocrush");
  const pref = new Set(config.iptv.preferredCountries);

  const rows: (Row | null)[] = [];

  // Trending: popularity-ranked, interleaved across all sources.
  const famelackLive = live.filter((l) => l.source === "famelack");
  const trending = roundRobin(
    [fawesome, archive, retro, live.filter((l) => l.source === "iptv" && pref.has(l.country ?? "")), famelackLive],
    PER_ROW,
  );
  rows.push({ id: "trending", title: "Trending Now", views: ["home"], itemIds: trending.map((i) => i.id) });

  // Live TV
  const liveRows: [string, string, string, View[]][] = [
    ["live-news", "Live News", "news", ["home", "live"]],
    ["live-sports", "Live Sports", "sports", ["home", "live"]],
    ["live-movies", "Live Movie Channels", "movies", ["home", "live"]],
    ["live-kids", "Live Kids", "kids", ["live"]],
    ["live-music", "Live Music", "music", ["live"]],
    ["live-ent", "Live Entertainment", "entertainment", ["live"]],
    ["live-comedy", "Live Comedy", "comedy", ["live"]],
    ["live-doc", "Live Documentary & Science", "documentary", ["live"]],
    ["live-classic", "Live Classic TV", "classic tv", ["live"]],
    ["live-general", "Live General", "general", ["live"]],
  ];
  for (const [id, title, g, views] of liveRows) {
    // Preferred countries first, then the rest of the world.
    const matches = live.filter((l) => has(l, g));
    const ordered = [...matches.filter((l) => pref.has(l.country ?? "")).sort(byPop), ...matches.filter((l) => !pref.has(l.country ?? "")).sort(byPop)];
    if (ordered.length >= MIN_ROW) rows.push({ id, title, views, itemIds: ordered.slice(0, PER_ROW).map((i) => i.id) });
  }
  const countryNames: Record<string, string> = { US: "USA", GB: "UK", CA: "Canada", AU: "Australia" };
  for (const [cc, name] of Object.entries(countryNames))
    rows.push(row(`live-${cc}`, `Live from ${name}`, ["live"], live.filter((l) => l.country === cc)));
  rows.push(row("live-world", "Live from Around the World", ["live"], live.filter((l) => !pref.has(l.country ?? ""))));

  // Famelack: its own TV row, webcams and radio.
  rows.push(row("famelack-tv", "Famelack Live TV", ["home", "live"], famelackLive));
  rows.push(row("webcams", "Live Webcams", ["home", "live"], cams));
  const camRows: [string, string, string[]][] = [
    ["webcams-nature", "Webcams: Nature & Animals", ["nature", "animals", "mountain", "volcano", "lake", "river"]],
    ["webcams-water", "Webcams: Beaches, Harbors & Underwater", ["beach", "harbor", "underwater"]],
    ["webcams-city", "Webcams: Cities & Landmarks", ["city", "landmark"]],
    ["webcams-transport", "Webcams: Airports, Trains & Space", ["airport", "train", "space"]],
  ];
  for (const [id, title, gs] of camRows) rows.push(row(id, title, ["live"], cams.filter((c) => gs.some((g) => has(c, g)))));
  rows.push(row("radio", "Famelack Radio", ["home", "live"], radio));
  const radioRows: [string, string, string[]][] = [
    ["radio-hits", "Radio: Hits & Pop", ["hits", "pop"]],
    ["radio-rock", "Radio: Rock", ["rock"]],
    ["radio-hiphop", "Radio: Hip-Hop, Soul & R&B", ["hip-hop", "soul"]],
    ["radio-country", "Radio: Country", ["country"]],
    ["radio-decades", "Radio: Oldies & Decades", ["oldies", "70s", "80s", "90s"]],
    ["radio-jazz", "Radio: Jazz, Blues & Classical", ["jazz", "blues", "classical"]],
    ["radio-chill", "Radio: Chill & Electronic", ["chill", "electronic"]],
    ["radio-latin", "Radio: Latin & Reggae", ["latin", "reggae"]],
    ["radio-talk", "Radio: News & Talk", ["news"]],
  ];
  for (const [id, title, gs] of radioRows) rows.push(row(id, title, ["live"], radio.filter((r) => gs.some((g) => has(r, g)))));

  // Anime
  rows.push(row("anime-retro", "Classic Anime on RetroCrush", ["home", "anime"], retro));
  rows.push(row("anime-movies", "Anime Movies", ["anime"], retro.filter((i) => i.type === "movie")));
  rows.push(row("anime-cartoons", "Vintage Cartoons", ["anime"], archive.filter((i) => has(i, "animation"))));
  rows.push(row("anime-fawesome", "Animation on Fawesome", ["anime"], fawesome.filter((i) => has(i, "animation"))));

  // Movies & shows
  rows.push(row("fawesome-movies", "Free Movies on Fawesome", ["home", "movies"], fawesome.filter((i) => i.type === "movie")));
  rows.push(row("fawesome-series", "Series on Fawesome", ["home", "movies"], fawesome.filter((i) => i.type === "series")));
  rows.push(row("archive-classics", "Public-Domain Classics", ["home", "movies"], archive.filter((i) => !has(i, "animation") && !has(i, "classic tv"))));
  rows.push(row("archive-cartoons", "Classic Cartoons", ["home"], archive.filter((i) => has(i, "animation"))));
  rows.push(row("archive-tv", "Classic TV Episodes", ["home", "movies"], archive.filter((i) => has(i, "classic tv"))));

  const genreRows: [string, string, View[]][] = [
    ["action", "Action & Adventure", ["home", "movies"]],
    ["comedy", "Comedy", ["home", "movies"]],
    ["horror", "Horror", ["home", "movies"]],
    ["sci-fi", "Sci-Fi", ["home", "movies"]],
    ["drama", "Drama", ["movies"]],
    ["thriller", "Thrillers", ["movies"]],
    ["crime", "Crime & Noir", ["movies"]],
    ["western", "Westerns", ["movies"]],
    ["romance", "Romance", ["movies"]],
    ["war", "War", ["movies"]],
    ["documentary", "Documentaries", ["movies"]],
    ["family", "Family", ["movies"]],
    ["fantasy", "Fantasy", ["movies"]],
    ["mystery", "Mystery", ["movies"]],
    ["faith", "Faith", ["movies"]],
  ];
  for (const [g, title, views] of genreRows) {
    const pool = vod.filter((i) => has(i, g) && i.source !== "retrocrush");
    const mixed = roundRobin([pool.filter((i) => i.source === "fawesome"), pool.filter((i) => i.source === "archive")], PER_ROW);
    rows.push(row(`genre-${g}`, title, views, mixed));
  }

  return rows.filter((r): r is Row => !!r && r.itemIds.length >= MIN_ROW);
}
