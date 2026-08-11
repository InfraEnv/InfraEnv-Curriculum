/** SPDX-License-Identifier: Apache-2.0 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateIntegrity, canonicalJson, runtimeProfile, withIntegrity } from "../src/compiler.js";
import { loadSourceCatalog } from "../src/load-content.js";
import { compilePortableLessonDocument } from "../src/portable-lesson.js";
import { validateRestrictedMdx } from "../src/restricted-mdx.js";
import type { Locale, PortableLessonDocument, ProfileManifest } from "../src/types.js";
import { validateCatalog } from "../src/validate-catalog.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = join(repositoryRoot, "content");
const distRoot = join(repositoryRoot, "dist");

const filesBelow = (root: string): string[] => {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : entry.isFile() ? [path] : [];
  }).sort((left, right) => left.localeCompare(right, "en"));
};

const write = (path: string, value: string | Uint8Array): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
};

const copyTextTree = (sourceRoot: string, targetRoot: string, predicate: (path: string) => boolean): void => {
  for (const sourcePath of filesBelow(sourceRoot).filter(predicate)) {
    write(join(targetRoot, relative(sourceRoot, sourcePath)), readFileSync(sourcePath));
  }
};

const digest = (value: string | Uint8Array): string => `sha256-${createHash("sha256").update(value).digest("hex")}`;
const localeForAsset = (asset: string, fallback: Locale): Locale => {
  const match = /\.(zh-CN|en)\.mdx$/u.exec(asset);
  return (match?.[1] as Locale | undefined) ?? fallback;
};

function finalizeProfile(
  root: string,
  profile: ProfileManifest["profile"],
  schemaVersion: string,
  contentVersion: string,
): void {
  const artifacts = calculateIntegrity(root);
  const catalogSha256 = artifacts["catalog.json"];
  if (!catalogSha256) throw new Error(`${profile} profile has no catalog.json digest.`);
  const manifest: ProfileManifest = {
    profile,
    schemaVersion,
    contentVersion,
    catalogSha256,
    artifacts,
    contentLicense: "CC-BY-4.0",
  };
  write(join(root, "profile-manifest.json"), canonicalJson(manifest));
}

const sourceCatalog = loadSourceCatalog({ repositoryRoot });
const catalogValidation = validateCatalog(sourceCatalog);
if (!catalogValidation.valid) throw new Error(catalogValidation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));

for (const path of filesBelow(join(contentRoot, "mdx")).filter((item) => item.endsWith(".mdx"))) {
  const asset = relative(contentRoot, path).replaceAll("\\", "/");
  const validation = validateRestrictedMdx(readFileSync(path, "utf8"), asset);
  if (!validation.valid) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
}

const lessonDocuments: PortableLessonDocument[] = sourceCatalog.lessons.map((lesson) =>
  compilePortableLessonDocument(readFileSync(join(contentRoot, lesson.bodyAsset), "utf8"), {
    lessonId: lesson.id,
    locale: localeForAsset(lesson.bodyAsset, sourceCatalog.manifest.defaultLocale),
    sourceAsset: lesson.bodyAsset,
  }),
);
const catalog = withIntegrity(sourceCatalog, contentRoot);
const easyInfraProfileRoot = join(distRoot, "profiles", "easyinfra");
const runtimeProfileRoot = join(distRoot, "profiles", "runtime");
const notice = "DO NOT EDIT: generated deterministically by @infraenv/curriculum.\n";
const contractTypes = readFileSync(join(repositoryRoot, "src", "types.ts"));
const contractSchema = JSON.parse(readFileSync(join(repositoryRoot, "schemas", "content.schema.json"), "utf8")) as Record<string, unknown>;
const rootedContractSchema = (id: string, title: string, definition: string): string => canonicalJson({
  ...contractSchema,
  $id: id,
  title,
  $ref: `#/$defs/${definition}`,
});
const easyInfraCatalogSchema = rootedContractSchema(
  "https://infraenv.dev/schemas/curriculum/easyinfra-profile-v2.schema.json",
  "InfraEnv Curriculum v2 EasyInfra Profile",
  "contentCatalog",
);
const runtimeCatalogSchema = rootedContractSchema(
  "https://infraenv.dev/schemas/curriculum/runtime-profile-v2.schema.json",
  "InfraEnv Curriculum v2 Runtime Profile",
  "runtimeContentProfile",
);
const contentManifestSchema = rootedContractSchema(
  "https://infraenv.dev/schemas/curriculum/content-manifest-v2.schema.json",
  "InfraEnv Curriculum v2 Compiled Content Manifest",
  "manifest",
);
const profileManifestSchema = rootedContractSchema(
  "https://infraenv.dev/schemas/curriculum/profile-manifest-v2.schema.json",
  "InfraEnv Curriculum v2 Profile Manifest",
  "profileManifest",
);
const contentLicense = readFileSync(join(repositoryRoot, "LICENSE-CONTENT"));
const codeLicense = readFileSync(join(repositoryRoot, "LICENSE-CODE"));
const attribution = readFileSync(join(contentRoot, "LICENSE.md"));

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
write(join(easyInfraProfileRoot, "contracts", "content.schema.json"), easyInfraCatalogSchema);
write(join(easyInfraProfileRoot, "contracts", "content-manifest.schema.json"), contentManifestSchema);
write(join(easyInfraProfileRoot, "contracts", "profile-manifest.schema.json"), profileManifestSchema);
write(join(easyInfraProfileRoot, "contracts", "content-contract.d.ts"), contractTypes);
write(join(easyInfraProfileRoot, "LICENSE-CONTENT"), contentLicense);
write(join(easyInfraProfileRoot, "LICENSE-CODE"), codeLicense);
write(join(easyInfraProfileRoot, "ATTRIBUTION.md"), attribution);
finalizeProfile(easyInfraProfileRoot, "easyinfra", catalog.manifest.schemaVersion, catalog.manifest.contentVersion);

const runtime = runtimeProfile(catalog, lessonDocuments);
write(join(runtimeProfileRoot, "DO-NOT-EDIT.txt"), notice);
write(join(runtimeProfileRoot, "catalog.json"), canonicalJson(runtime));
write(join(runtimeProfileRoot, "content-manifest.json"), canonicalJson(catalog.manifest));
copyTextTree(join(contentRoot, "mdx", "lessons"), join(runtimeProfileRoot, "mdx", "lessons"), (path) => path.endsWith(".mdx"));
for (const document of lessonDocuments) {
  const assetName = `${document.lessonId.replace(":", "-")}.${document.locale}.json`;
  write(join(runtimeProfileRoot, "lesson-documents", assetName), canonicalJson(document));
}
write(join(runtimeProfileRoot, "contracts", "content.schema.json"), runtimeCatalogSchema);
write(join(runtimeProfileRoot, "contracts", "content-manifest.schema.json"), contentManifestSchema);
write(join(runtimeProfileRoot, "contracts", "profile-manifest.schema.json"), profileManifestSchema);
write(join(runtimeProfileRoot, "contracts", "content-contract.d.ts"), contractTypes);
write(join(runtimeProfileRoot, "LICENSE-CONTENT"), contentLicense);
write(join(runtimeProfileRoot, "LICENSE-CODE"), codeLicense);
write(join(runtimeProfileRoot, "ATTRIBUTION.md"), attribution);
finalizeProfile(runtimeProfileRoot, "runtime", catalog.manifest.schemaVersion, catalog.manifest.contentVersion);

copyTextTree(join(repositoryRoot, "schemas"), join(distRoot, "schemas"), (path) => path.endsWith(".json"));
write(join(distRoot, "schemas", "runtime-profile.schema.json"), runtimeCatalogSchema);
write(join(distRoot, "schemas", "content-manifest.schema.json"), contentManifestSchema);
write(join(distRoot, "schemas", "profile-manifest.schema.json"), profileManifestSchema);

const profileDigests = {
  easyinfra: digest(readFileSync(join(easyInfraProfileRoot, "profile-manifest.json"))),
  runtime: digest(readFileSync(join(runtimeProfileRoot, "profile-manifest.json"))),
};
write(join(distRoot, "profile-digests.json"), canonicalJson(profileDigests));

process.stdout.write(
  `Built curriculum ${catalog.manifest.contentVersion}: ${catalog.topics.length} topics, ${catalog.concepts.length} concepts, ${catalog.tools.length} tools, ${catalog.cases.length} cases, ${catalog.presets.length} presets, ${catalog.lessons.length} lesson, ${catalog.labs.length} lab, ${catalog.scenarios.length} scenario, ${lessonDocuments.length} portable lesson document.\n`,
);
