/** SPDX-License-Identifier: Apache-2.0 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateIntegrity, canonicalJson, runtimeProfile, withIntegrity } from "../src/compiler.js";
import { loadSourceCatalog } from "../src/load-content.js";
import { compilePortableLessonDocument } from "../src/portable-lesson.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = join(repositoryRoot, "content");

test("serializes snapshots deterministically", () => {
  const catalog = withIntegrity(loadSourceCatalog({ repositoryRoot }), contentRoot);
  assert.equal(canonicalJson(catalog), canonicalJson(withIntegrity(loadSourceCatalog({ repositoryRoot }), contentRoot)));
  assert.deepEqual(calculateIntegrity(contentRoot), calculateIntegrity(contentRoot));
});

test("runtime profile includes versioned infrastructure and portable lessons", () => {
  const catalog = withIntegrity(loadSourceCatalog({ repositoryRoot }), contentRoot);
  const lesson = catalog.lessons.at(0);
  assert.ok(lesson);
  const document = compilePortableLessonDocument(readFileSync(join(contentRoot, lesson.bodyAsset), "utf8"), {
    lessonId: lesson.id,
    locale: "zh-CN",
    sourceAsset: lesson.bodyAsset,
  });
  const profile = runtimeProfile(catalog, [document]);
  assert.deepEqual(Object.keys(profile), [
    "manifest", "sources", "accelerators", "fabrics", "systems", "bootProfiles", "presets",
    "courses", "chapters", "lessons", "labs", "scenarios", "lessonDocuments",
  ]);
  assert.equal("topics" in profile, false);
  assert.equal(profile.presets.length, catalog.presets.length);
  assert.equal(profile.lessonDocuments.at(0)?.lessonId, lesson.id);
});
