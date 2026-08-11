/** SPDX-License-Identifier: Apache-2.0 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withIntegrity } from "../src/compiler.js";
import { loadSourceCatalog } from "../src/load-content.js";
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

const catalogValidation = validateCatalog(catalog);
errors.push(...catalogValidation.issues.map((issue) => `${issue.path}: ${issue.message}`));

const rawSemanticCatalog = [catalog.topics, catalog.concepts, catalog.tools, catalog.cases] as unknown[];
const serialized = JSON.stringify(rawSemanticCatalog);
for (const forbidden of ["position", "iconSlug", "brandColor"]) {
  if (serialized.includes(`\"${forbidden}\"`)) errors.push(`Presentation-only field leaked into semantic catalog: ${forbidden}`);
}

const mdxFiles = filesBelow(join(contentRoot, "mdx")).filter((path) => path.endsWith(".mdx"));
for (const path of mdxFiles) {
  const validation = validateRestrictedMdx(readFileSync(path, "utf8"), path);
  errors.push(...validation.issues.map((issue) => `${issue.path}: ${issue.message}`));
}
for (const bodyAsset of [...catalog.cases.map((item) => item.bodyAsset), ...catalog.lessons.map((item) => item.bodyAsset)]) {
  if (!existsSync(join(contentRoot, bodyAsset))) errors.push(`Missing body asset: ${bodyAsset}`);
}

for (const lab of catalog.labs) {
  for (const validator of lab.validators) {
    const keys = Object.keys(validator);
    if (keys.some((key) => ["code", "script", "module", "eval", "command"].includes(key))) {
      errors.push(`${validator.id}: executable validator fields are forbidden`);
    }
  }
}

const withHashes = withIntegrity(catalog, contentRoot);
if (Object.keys(withHashes.manifest.integrity).length !== filesBelow(contentRoot).length) {
  errors.push("Integrity manifest does not cover every source content asset");
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Content OK: ${catalog.topics.length} topics, ${catalog.concepts.length} concepts, ${catalog.tools.length} tools, ${catalog.cases.length} cases, ${catalog.courses.length} course, ${catalog.labs.length} lab, ${catalog.scenarios.length} scenario, ${mdxFiles.length} restricted MDX assets.\n`,
  );
}

