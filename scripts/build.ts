/** SPDX-License-Identifier: Apache-2.0 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, runtimeProfile, withIntegrity } from "../src/compiler.js";
import { loadSourceCatalog } from "../src/load-content.js";
import { validateRestrictedMdx } from "../src/restricted-mdx.js";
import { validateCatalog } from "../src/validate-catalog.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = join(repositoryRoot, "content");
const distRoot = join(repositoryRoot, "dist");

const filesBelow = (root: string): string[] => {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort((left, right) => left.localeCompare(right, "en"));
};

const write = (path: string, value: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
};

const copyTextTree = (sourceRoot: string, targetRoot: string, predicate: (path: string) => boolean): void => {
  for (const sourcePath of filesBelow(sourceRoot).filter(predicate)) {
    const targetPath = join(targetRoot, relative(sourceRoot, sourcePath));
    write(targetPath, readFileSync(sourcePath, "utf8"));
  }
};

const sourceCatalog = loadSourceCatalog({ repositoryRoot });
const catalogValidation = validateCatalog(sourceCatalog);
if (!catalogValidation.valid) {
  throw new Error(catalogValidation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
}

for (const path of filesBelow(join(contentRoot, "mdx")).filter((item) => item.endsWith(".mdx"))) {
  const asset = relative(contentRoot, path).replaceAll("\\", "/");
  const validation = validateRestrictedMdx(readFileSync(path, "utf8"), asset);
  if (!validation.valid) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
}

const catalog = withIntegrity(sourceCatalog, contentRoot);
const easyInfraProfileRoot = join(distRoot, "profiles", "easyinfra");
const runtimeProfileRoot = join(distRoot, "profiles", "runtime");
const notice = "DO NOT EDIT: generated deterministically by @infraenv/curriculum.\n";

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });

write(join(distRoot, "catalog.json"), canonicalJson(catalog));
write(join(distRoot, "content-manifest.json"), canonicalJson(catalog.manifest));
write(join(distRoot, "catalog.js"), `/** Generated; DO NOT EDIT. */\nexport const catalog = ${canonicalJson(catalog).trim()};\nexport default catalog;\n`);
write(join(distRoot, "catalog.d.ts"), 'import type { ContentCatalog } from "./index.js";\nexport declare const catalog: ContentCatalog;\nexport default catalog;\n');
write(join(distRoot, "manifest.js"), `/** Generated; DO NOT EDIT. */\nexport const manifest = ${canonicalJson(catalog.manifest).trim()};\nexport default manifest;\n`);
write(join(distRoot, "manifest.d.ts"), 'import type { ContentManifest } from "./index.js";\nexport declare const manifest: ContentManifest;\nexport default manifest;\n');

write(join(easyInfraProfileRoot, "DO-NOT-EDIT.txt"), notice);
write(join(easyInfraProfileRoot, "catalog.json"), canonicalJson(catalog));
write(join(easyInfraProfileRoot, "content-manifest.json"), canonicalJson(catalog.manifest));
copyTextTree(join(contentRoot, "mdx"), join(easyInfraProfileRoot, "mdx"), (path) => path.endsWith(".mdx"));

const runtime = runtimeProfile(catalog);
write(join(runtimeProfileRoot, "DO-NOT-EDIT.txt"), notice);
write(join(runtimeProfileRoot, "catalog.json"), canonicalJson(runtime));
write(join(runtimeProfileRoot, "content-manifest.json"), canonicalJson(catalog.manifest));
copyTextTree(join(contentRoot, "mdx", "lessons"), join(runtimeProfileRoot, "mdx", "lessons"), (path) => path.endsWith(".mdx"));

copyTextTree(join(repositoryRoot, "schemas"), join(distRoot, "schemas"), (path) => path.endsWith(".json"));

process.stdout.write(
  `Built curriculum ${catalog.manifest.contentVersion}: ${catalog.topics.length} topics, ${catalog.concepts.length} concepts, ${catalog.tools.length} tools, ${catalog.cases.length} cases, ${catalog.lessons.length} lesson, ${catalog.labs.length} lab, ${catalog.scenarios.length} scenario.\n`,
);

