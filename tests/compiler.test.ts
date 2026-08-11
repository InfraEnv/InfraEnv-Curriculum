/** SPDX-License-Identifier: Apache-2.0 */
import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateIntegrity, canonicalJson, runtimeProfile, withIntegrity } from "../src/compiler.js";
import { loadSourceCatalog } from "../src/load-content.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = join(repositoryRoot, "content");

test("serializes snapshots deterministically", () => {
  const catalog = withIntegrity(loadSourceCatalog({ repositoryRoot }), contentRoot);
  const first = canonicalJson(catalog);
  const second = canonicalJson(withIntegrity(loadSourceCatalog({ repositoryRoot }), contentRoot));
  assert.equal(first, second);
  assert.deepEqual(calculateIntegrity(contentRoot), calculateIntegrity(contentRoot));
});

test("runtime profile includes operational content and excludes website catalog", () => {
  const catalog = withIntegrity(loadSourceCatalog({ repositoryRoot }), contentRoot);
  const profile = runtimeProfile(catalog);
  assert.deepEqual(Object.keys(profile), ["manifest", "courses", "chapters", "lessons", "labs", "scenarios"]);
  assert.equal("topics" in profile, false);
  assert.equal(profile.labs.at(0)?.scenarioRef.id, "scenario:slow-worker-bandwidth-drop");
});

