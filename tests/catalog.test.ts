/** SPDX-License-Identifier: Apache-2.0 */
import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSourceCatalog } from "../src/load-content.js";
import { validateCatalog } from "../src/validate-catalog.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = loadSourceCatalog({ repositoryRoot });

test("migrates the complete EasyInfra semantic catalog", () => {
  assert.deepEqual(
    [catalog.topics.length, catalog.concepts.length, catalog.tools.length, catalog.cases.length],
    [27, 57, 44, 5],
  );
  assert.equal(validateCatalog(catalog).valid, true);
});

test("keeps presentation overlays out of shared content", () => {
  const serialized = JSON.stringify([catalog.concepts, catalog.tools]);
  assert.equal(serialized.includes('"position"'), false);
  assert.equal(serialized.includes('"iconSlug"'), false);
  assert.equal(serialized.includes('"brandColor"'), false);
});

test("defines the deterministic 128-GPU slow-worker scenario", () => {
  const scenario = catalog.scenarios.at(0);
  assert.ok(scenario);
  assert.equal(scenario.cluster.nodeCount, 16);
  assert.equal(scenario.cluster.gpusPerNode, 8);
  assert.equal(scenario.cluster.totalGpuCount, 128);
  assert.match(scenario.cluster.gpuModel, /SIMULATED/);
  assert.deepEqual(scenario.events.at(0), {
    id: "event:activate-node03-bandwidth-fault",
    atSeconds: 40,
    type: "fault.activate",
    fault: {
      id: "fault:node03-bandwidth",
      kind: "network.bandwidth_drop",
      target: "node03",
      parameters: { fromGbps: 400, toGbps: 20 },
    },
  });
});

test("uses declarative validators only", () => {
  const lab = catalog.labs.at(0);
  assert.ok(lab);
  assert.deepEqual(
    lab.validators.map((validator) => validator.kind),
    [
      "observation-recorded",
      "observation-recorded",
      "observation-recorded",
      "target-inspected",
      "diagnosis-matches",
      "fault-state",
      "metric-threshold",
      "metric-threshold",
    ],
  );
  for (const validator of lab.validators) {
    assert.equal(Object.keys(validator).some((key) => ["code", "script", "eval", "command"].includes(key)), false);
  }
});

