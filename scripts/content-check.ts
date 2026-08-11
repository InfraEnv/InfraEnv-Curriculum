/** SPDX-License-Identifier: Apache-2.0 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withIntegrity } from "../src/compiler.js";
import { loadSourceCatalog } from "../src/load-content.js";
import { compilePortableLessonDocument } from "../src/portable-lesson.js";
import { validateRestrictedMdx } from "../src/restricted-mdx.js";
import { validateCatalog } from "../src/validate-catalog.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = join(repositoryRoot, "content");
const filesBelow = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });

const catalog = loadSourceCatalog({ repositoryRoot });
const errors: string[] = [];
const expectedCounts = { topics: 27, concepts: 57, tools: 44, cases: 5 } as const;
for (const [key, expected] of Object.entries(expectedCounts) as Array<[keyof typeof expectedCounts, number]>) {
  if (catalog[key].length !== expected) errors.push(`${key}: expected ${expected}, got ${catalog[key].length}`);
}
if (catalog.manifest.schemaVersion !== "2.0.0") errors.push(`schemaVersion must be 2.0.0, got ${catalog.manifest.schemaVersion}`);
if (catalog.manifest.contentVersion !== "0.2.0-alpha.0") errors.push(`contentVersion must be 0.2.0-alpha.0, got ${catalog.manifest.contentVersion}`);

const validation = validateCatalog(catalog);
errors.push(...validation.issues.map((issue) => `${issue.path}: ${issue.message}`));

const rawSemanticCatalog = [catalog.topics, catalog.concepts, catalog.tools, catalog.cases] as unknown[];
const serialized = JSON.stringify(rawSemanticCatalog);
for (const forbidden of ["position", "iconSlug", "brandColor"]) {
  if (serialized.includes(`\"${forbidden}\"`)) errors.push(`Presentation-only field leaked into semantic catalog: ${forbidden}`);
}

const mdxFiles = filesBelow(join(contentRoot, "mdx")).filter((path) => path.endsWith(".mdx"));
for (const path of mdxFiles) {
  const result = validateRestrictedMdx(readFileSync(path, "utf8"), path);
  errors.push(...result.issues.map((issue) => `${issue.path}: ${issue.message}`));
}
for (const bodyAsset of [...catalog.cases.map((item) => item.bodyAsset), ...catalog.lessons.map((item) => item.bodyAsset)]) {
  if (!existsSync(join(contentRoot, bodyAsset))) errors.push(`Missing body asset: ${bodyAsset}`);
}
for (const lesson of catalog.lessons) {
  try {
    const locale = lesson.bodyAsset.includes(".en.mdx") ? "en" : catalog.manifest.defaultLocale;
    const document = compilePortableLessonDocument(readFileSync(join(contentRoot, lesson.bodyAsset), "utf8"), {
      lessonId: lesson.id,
      locale,
      sourceAsset: lesson.bodyAsset,
    });
    if (document.blocks.length === 0) errors.push(`${lesson.id}: portable lesson document is empty`);
  } catch (error) {
    errors.push(`${lesson.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const lab of catalog.labs) {
  for (const validator of lab.validators) {
    if (Object.keys(validator).some((key) => ["code", "script", "module", "eval", "command"].includes(key))) {
      errors.push(`${validator.id}: executable validator fields are forbidden`);
    }
  }
}

const requiredVersioned = [
  "preset:a100-pcie-pair@1.0.0",
  "preset:hgx-a100-four@1.0.0",
  "preset:dgx-hgx-a100-eight@1.0.0",
  "preset:h100-fat-tree-16x8@1.0.0",
  "preset:dgx-h100-single-node@1.0.0",
  "preset:dgx-b200-single-node@1.0.0",
  "preset:gb200-nvl72-single-rack@1.0.0",
  "preset:gb200-superpod-eight-rack@1.0.0",
  "preset:gb300-nvl72-single-rack@1.0.0",
  "preset:gb300-two-rack@1.0.0",
  "preset:gb300-four-rack@1.0.0",
  "preset:gb300-eight-rack@1.0.0",
  "preset:gb300-sixteen-rack-derived@1.0.0",
  "preset:freeform-four-h100-pcie@1.0.0",
  "scenario:slow-worker-bandwidth-drop@2.0.0",
];
const versionedKeys = new Set([...catalog.presets, ...catalog.scenarios].map((item) => `${item.id}@${item.version}`));
for (const key of requiredVersioned) if (!versionedKeys.has(key)) errors.push(`Required versioned content is missing: ${key}`);
for (const fidelity of ["exact", "derived", "freeform"] as const) {
  if (!catalog.presets.some((preset) => preset.fidelity === fidelity)) errors.push(`No ${fidelity} preset is defined`);
}
if (catalog.sources.some((source) => source.sourceType !== "official" || !source.url.startsWith("https://"))) errors.push("Every hardware source must be an official HTTPS record");

const withHashes = withIntegrity(catalog, contentRoot);
if (Object.keys(withHashes.manifest.integrity).length !== filesBelow(contentRoot).length) errors.push("Integrity manifest does not cover every source content asset");

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Content OK: ${catalog.topics.length} topics, ${catalog.concepts.length} concepts, ${catalog.tools.length} tools, ${catalog.cases.length} cases, ${catalog.sources.length} official sources, ${catalog.presets.length} presets, ${catalog.labs.length} lab, ${catalog.scenarios.length} scenario, ${mdxFiles.length} restricted MDX assets.\n`,
  );
}
