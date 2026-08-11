/** SPDX-License-Identifier: Apache-2.0 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ContentCatalog, ContentManifest } from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, canonicalize(value[key])]),
  );
};

export const canonicalJson = (value: unknown): string => `${JSON.stringify(canonicalize(value), null, 2)}\n`;

function filesBelow(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort((left, right) => left.localeCompare(right, "en"));
}

export function calculateIntegrity(contentRoot: string): Record<string, string> {
  return Object.fromEntries(
    filesBelow(contentRoot).map((path) => {
      const asset = relative(contentRoot, path).replaceAll("\\", "/");
      const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
      return [asset, `sha256-${digest}`];
    }),
  );
}

export function withIntegrity(catalog: ContentCatalog, contentRoot: string): ContentCatalog {
  const manifest: ContentManifest = { ...catalog.manifest, integrity: calculateIntegrity(contentRoot) };
  return { ...catalog, manifest };
}

export function runtimeProfile(catalog: ContentCatalog): Pick<
  ContentCatalog,
  "manifest" | "courses" | "chapters" | "lessons" | "labs" | "scenarios"
> {
  const { manifest, courses, chapters, lessons, labs, scenarios } = catalog;
  return { manifest, courses, chapters, lessons, labs, scenarios };
}

