import { config } from "../config.js";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(
  url: string,
  opts: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {},
): Promise<string> {
  const { timeoutMs = 20000, retries = 2, headers = {} } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": config.userAgent, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { fatal: true });
      return await res.text();
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await sleep(1000 * (attempt + 1) ** 2);
    }
  }
  throw lastErr;
}

export async function fetchJson<T>(url: string, opts?: Parameters<typeof fetchText>[1]): Promise<T> {
  return JSON.parse(await fetchText(url, opts)) as T;
}

/** Run `fn` over `items` with at most `concurrency` in flight. Results keep input order; failures become null. */
export async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
      done++;
      if (onProgress && (done % 50 === 0 || done === items.length)) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}
