/** SPDX-License-Identifier: Apache-2.0 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptScenarioV1, type LegacyScenarioV1 } from "../src/legacy-v1.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(readFileSync(join(repositoryRoot, "tests", "fixtures", "slow-worker-scenario.v1.json"), "utf8")) as LegacyScenarioV1;

test("adapts the frozen v1 scenario without losing event semantics", () => {
  const adapted = adaptScenarioV1(fixture, {
    scenarioVersion: "2.0.0",
    presetId: "preset:legacy-slow-worker",
    presetVersion: "1.0.0",
    presetSlug: "legacy-slow-worker",
    systemRef: { id: "system:dgx-h100", version: "1.0.0" },
    fabricRef: { id: "fabric:infiniband-ndr400", version: "1.0.0" },
    bootProfileRef: { id: "boot:gpu-node-standard", version: "1.0.0" },
    sourceIds: ["source:nvidia-dgx-h100-user-guide"],
  });
  assert.equal(adapted.preset.systemGroups.at(0)?.count, 16);
  assert.equal(adapted.preset.fabrics.at(0)?.capacityGbps, 400);
  assert.deepEqual(adapted.scenario.presetRef, { id: "preset:legacy-slow-worker", version: "1.0.0" });
  assert.deepEqual(adapted.scenario.events, fixture.events);
  assert.equal(adapted.scenario.job?.workersPerNode, 8);
});
