import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

/**
 * Content-addressed embedding cache for the evaluation harness.
 *
 * Keyed by sha256(model:dims:text), so re-running the eval with different
 * *scoring* logic costs nothing — only genuinely new text is embedded. This is
 * the same idea as the production content-hash gate: the expensive call is
 * skipped whenever the document text hasn't actually changed.
 *
 * Stored as float32 base64 rather than JSON number arrays: ~4x smaller on disk
 * and avoids float round-tripping noise.
 */

export function contentKey(model: string, dims: number, text: string): string {
  return createHash("sha256").update(`${model}:${dims}:${text}`).digest("hex").slice(0, 32);
}

function encode(v: number[]): string {
  return Buffer.from(new Float32Array(v).buffer).toString("base64");
}

function decode(s: string): number[] {
  const buf = Buffer.from(s, "base64");
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
}

export class EmbedCache {
  private map: Record<string, string>;
  private hits = 0;
  private misses = 0;

  constructor(private path: string) {
    this.map = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  }

  get(key: string): number[] | undefined {
    const v = this.map[key];
    if (v) {
      this.hits++;
      return decode(v);
    }
    this.misses++;
    return undefined;
  }

  set(key: string, vec: number[]): void {
    this.map[key] = encode(vec);
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.map));
  }

  stats() {
    return { hits: this.hits, misses: this.misses, size: Object.keys(this.map).length };
  }
}
