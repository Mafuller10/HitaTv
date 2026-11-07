// Tunables for the catalog build. `--quick` (see build.ts) shrinks every limit for fast local iteration.
export const config = {
  userAgent: "HitaTV-catalog-builder/0.1",

  iptv: {
    api: "https://iptv-org.github.io/api",
    // Channels from these countries are preferred; others only fill category rows if space remains.
    preferredCountries: ["US", "GB", "CA", "AU", "IE", "NZ"],
    maxChannels: 450, // after health check
    maxCandidates: 1100, // streams probed
    perRow: 40,
  },

  famelack: {
    // Famelack's own MIT-licensed public dataset: https://github.com/famelack/famelack-data
    raw: "https://raw.githubusercontent.com/famelack/famelack-data/main",
    countries: ["us", "gb", "ca", "au"],
    tvCategories: [
      "news", "top-news", "sports", "movies", "series", "kids", "animation", "family", "music", "comedy",
      "entertainment", "documentary", "science", "classic", "lifestyle", "cooking", "travel", "outdoor",
      "religious", "weather", "general", "show", "relax",
    ],
    radioCategories: [
      "hits", "pop", "rock", "hip-hop", "country", "jazz", "classical", "oldies", "70s", "80s", "90s",
      "soul", "blues", "electronic", "chill", "latin", "reggae", "news", "talk", "sports", "christmas",
    ],
    webcamCategories: [
      "beach", "city", "nature", "animals", "landmark", "mountain", "harbor", "airport", "train",
      "space", "underwater", "ski", "lake", "river", "volcano", "weather",
    ],
    maxTv: 300, // new channels after removing iptv-org duplicates and health check
    maxTvCandidates: 700,
    maxRadio: 200,
    maxRadioCandidates: 450,
    maxWebcams: 150,
    youtubeAppName: "YouTube",
  },

  archive: {
    // Internet Archive collections of public-domain / freely licensed video.
    collections: [
      { id: "feature_films", type: "movie" as const, extraGenres: ["classic"] },
      { id: "animationandcartoons", type: "movie" as const, extraGenres: ["animation", "classic"], minDurationSec: 150 },
      { id: "classic_tv", type: "movie" as const, extraGenres: ["classic tv"] },
      { id: "SciFi_Horror", type: "movie" as const, extraGenres: ["classic"] },
      { id: "Film_Noir", type: "movie" as const, extraGenres: ["crime", "classic"] },
      { id: "silent_films", type: "movie" as const, extraGenres: ["classic"] },
    ],
    perCollection: 150,
    minDownloads: 2000,
    minDurationSec: 600,
  },

  fawesome: {
    sitemaps: {
      movie: ["https://fawesome.tv/sitemaps/movies-pages.xml"],
      series: ["https://fawesome.tv/sitemaps/shows-pages.xml"],
    },
    maxMovies: 450,
    maxShows: 150,
    detailConcurrency: 2,
    detailDelayMs: 400, // politeness delay between detail-page requests per worker
    appName: "Fawesome",
  },

  retrocrush: {
    sitemap: "https://retrocrush.tv/sitemap-movies-shows.xml",
    appName: "RetroCrush",
  },

  // Content filter for user-generated / exploitation material.
  blockedWords: [
    "sex", "sexploitation", "sexploition", "nudity", "nude", "nudie", "erotic", "erotica", "porn",
    "xxx", "stripping", "striptease", "burlesque", "adult", "fetish", "playboy",
  ],

  similarCount: 8,
  descriptionMax: 220,
};

export type Config = typeof config;
