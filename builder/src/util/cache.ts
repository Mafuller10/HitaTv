import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve(import.meta.dirname, "../../.cache");

/** Tiny persistent key/value cache with TTL, one JSON file per namespace. */
export class DiskCache<V> {
  private file: string;
  private data: Record<string, { t: number; v: V }> = {};

  constructor(namespace: string, private ttlMs: number) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    this.file = path.join(CACHE_DIR, `${namespace}.json`);
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      this.data = {};
    }
  }

  get(key: string): V | undefined {
    const e = this.data[key];
    if (!e || Date.now() - e.t > this.ttlMs) return undefined;
    return e.v;
  }

  set(key: string, v: V) {
    this.data[key] = { t: Date.now(), v };
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data));
  }
}
