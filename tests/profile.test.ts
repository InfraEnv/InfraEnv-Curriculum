/** SPDX-License-Identifier: Apache-2.0 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type { ProfileManifest, RuntimeContentProfile } from "../src/types.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (path: string): string => `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const formatErrors = (errors: ErrorObject[] | null | undefined): string => JSON.stringify(errors ?? [], null, 2);

function assertSchemaAccepts(schemaPath: string, valuePath: string): void {
  const schema = readJson(schemaPath);
  const value = readJson(valuePath);
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(value), true, `${valuePath} failed ${schemaPath}:\n${formatErrors(validate.errors)}`);
}

for (const profile of ["easyinfra", "runtime"] as const) {
  test(`${profile} profile manifest covers every distributed contract and content asset`, () => {
    const root = join(repositoryRoot, "dist", "profiles", profile);
    const manifest = JSON.parse(readFileSync(join(root, "profile-manifest.json"), "utf8")) as ProfileManifest;
    assert.equal(manifest.profile, profile);
    assert.equal(manifest.schemaVersion, "2.0.0");
    assert.equal(manifest.contentVersion, "0.2.0-alpha.0");
    assert.equal(manifest.catalogSha256, digest(join(root, "catalog.json")));
    for (const [asset, expected] of Object.entries(manifest.artifacts)) {
      const target = resolve(root, ...asset.split("/"));
      assert.ok(target.startsWith(`${root}\\`) || target.startsWith(`${root}/`));
      assert.equal(digest(target), expected, asset);
    }
    for (const asset of ["contracts/content.schema.json", "contracts/content-contract.d.ts", "LICENSE-CONTENT", "LICENSE-CODE", "ATTRIBUTION.md"]) {
      assert.ok(manifest.artifacts[asset], asset);
    }
    for (const asset of ["contracts/content-manifest.schema.json", "contracts/profile-manifest.schema.json"]) {
      assert.ok(manifest.artifacts[asset], asset);
    }

    assertSchemaAccepts(join(root, "contracts", "content.schema.json"), join(root, "catalog.json"));
    assertSchemaAccepts(join(root, "contracts", "content-manifest.schema.json"), join(root, "content-manifest.json"));
    assertSchemaAccepts(join(root, "contracts", "profile-manifest.schema.json"), join(root, "profile-manifest.json"));
  });
}

test("compiled content manifest schema requires the integrity map", () => {
  const root = join(repositoryRoot, "dist", "profiles", "easyinfra");
  const schema = readJson(join(root, "contracts", "content-manifest.schema.json"));
  const manifest = readJson(join(root, "content-manifest.json")) as Record<string, unknown>;
  const { integrity: _integrity, ...withoutIntegrity } = manifest;
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(withoutIntegrity), false);
  assert.ok(validate.errors?.some((error) => error.keyword === "required" && error.params.missingProperty === "integrity"));
});

test("runtime profile ships a portable lesson document as both indexed data and a locked asset", () => {
  const root = join(repositoryRoot, "dist", "profiles", "runtime");
  const profile = JSON.parse(readFileSync(join(root, "catalog.json"), "utf8")) as RuntimeContentProfile;
  assert.equal(profile.lessonDocuments.length, 1);
  const document = profile.lessonDocuments[0];
  assert.ok(document);
  const asset = `lesson-documents/${document.lessonId.replace(":", "-")}.${document.locale}.json`;
  assert.equal(existsSync(join(root, ...asset.split("/"))), true);
  const manifest = JSON.parse(readFileSync(join(root, "profile-manifest.json"), "utf8")) as ProfileManifest;
  assert.ok(manifest.artifacts[asset]);
});
