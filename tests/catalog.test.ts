/** SPDX-License-Identifier: Apache-2.0 */
import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSourceCatalog } from "../src/load-content.js";
import { expandedPresetNodeNames, validateCatalog } from "../src/validate-catalog.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = loadSourceCatalog({ repositoryRoot });
const keyed = <T extends { id: string; version: string }>(items: T[], identity: string): T => {
  const item = items.find((candidate) => `${candidate.id}@${candidate.version}` === identity);
  assert.ok(item, identity);
  return item;
};

test("preserves the complete EasyInfra semantic catalog", () => {
  assert.deepEqual([catalog.topics.length, catalog.concepts.length, catalog.tools.length, catalog.cases.length], [27, 57, 44, 5]);
  assert.equal(catalog.manifest.schemaVersion, "2.0.0");
  assert.equal(catalog.manifest.contentVersion, "0.2.0-alpha.0");
  assert.deepEqual(validateCatalog(catalog).issues, []);
});

test("keeps presentation overlays out of shared content", () => {
  const serialized = JSON.stringify([catalog.concepts, catalog.tools]);
  assert.equal(serialized.includes('"position"'), false);
  assert.equal(serialized.includes('"iconSlug"'), false);
  assert.equal(serialized.includes('"brandColor"'), false);
});

test("defines exact, derived and freeform indexed presets", () => {
  assert.deepEqual(new Set(catalog.presets.map((preset) => preset.fidelity)), new Set(["exact", "derived", "freeform"]));
  for (const id of [
    "preset:a100-pcie-pair@1.0.0",
    "preset:hgx-a100-four@1.0.0",
    "preset:dgx-hgx-a100-eight@1.0.0",
    "preset:h100-fat-tree-16x8@1.0.0",
    "preset:gb200-superpod-eight-rack@1.0.0",
    "preset:gb300-nvl72-single-rack@1.0.0",
    "preset:gb300-two-rack@1.0.0",
    "preset:gb300-four-rack@1.0.0",
    "preset:gb300-eight-rack@1.0.0",
    "preset:gb300-sixteen-rack-derived@1.0.0",
  ]) keyed(catalog.presets, id);
});

test("does not confuse A100 PCIe and SXM profiles", () => {
  const pcie = keyed(catalog.accelerators, "accelerator:nvidia-a100-pcie-80gb@1.0.0");
  const sxm = keyed(catalog.accelerators, "accelerator:nvidia-a100-sxm-80gb@1.0.0");
  assert.match(pcie.model, /PCIe/);
  assert.match(sxm.model, /SXM/);
  assert.notEqual(pcie.thermalDesignPowerWatts, sxm.thermalDesignPowerWatts);
  const pair = keyed(catalog.systems, "system:a100-pcie-pair@1.0.0");
  assert.equal(pair.structure.intraSystemTopology, "nvlink-bridge-pair");
  assert.equal(pair.structure.nvlinkLinksPerAccelerator, 12);
  assert.equal(pair.structure.nvlinkBridgeAssembliesPerAccelerator, 3);
  assert.ok(pair.sourceIds.includes("source:nvidia-a100-pcie-80gb-brief"));
  const four = keyed(catalog.systems, "system:hgx-a100-four@1.0.0");
  assert.equal(four.structure.intraSystemTopology, "nvlink-full-mesh");
  assert.equal(four.structure.switchUnitCount, 0);
  assert.equal(four.structure.nvlinkLinksPerAccelerator, 12);
  assert.ok(four.sourceIds.includes("source:nvidia-hgx-a100-guide"));
  const eight = keyed(catalog.systems, "system:dgx-hgx-a100-eight@1.0.0");
  assert.equal(eight.structure.switchesPerSwitchUnit, 6);
  assert.equal(eight.structure.nvlinkLinksPerAccelerator, 12);
  const gb300 = keyed(catalog.systems, "system:gb300-nvl72@1.0.0");
  assert.ok(gb300.sourceIds.includes("source:nvidia-gb200-hardware"));
});

test("expands all 14 presets without flattening rack and switch hierarchy", () => {
  const expected = new Map<string, [fidelity: string, racks: number, nodes: number, gpus: number, switchUnits: number, switchAsics: number]>([
    ["preset:a100-pcie-pair@1.0.0", ["exact", 0, 1, 2, 0, 0]],
    ["preset:hgx-a100-four@1.0.0", ["exact", 0, 1, 4, 0, 0]],
    ["preset:dgx-hgx-a100-eight@1.0.0", ["exact", 0, 1, 8, 1, 6]],
    ["preset:h100-fat-tree-16x8@1.0.0", ["derived", 0, 16, 128, 16, 64]],
    ["preset:dgx-h100-single-node@1.0.0", ["exact", 0, 1, 8, 1, 4]],
    ["preset:dgx-b200-single-node@1.0.0", ["exact", 0, 1, 8, 1, 2]],
    ["preset:gb200-nvl72-single-rack@1.0.0", ["exact", 1, 18, 72, 9, 18]],
    ["preset:gb300-nvl72-single-rack@1.0.0", ["exact", 1, 18, 72, 9, 18]],
    ["preset:gb200-superpod-eight-rack@1.0.0", ["exact", 8, 144, 576, 72, 144]],
    ["preset:gb300-two-rack@1.0.0", ["exact", 2, 36, 144, 18, 36]],
    ["preset:gb300-four-rack@1.0.0", ["exact", 4, 72, 288, 36, 72]],
    ["preset:gb300-eight-rack@1.0.0", ["exact", 8, 144, 576, 72, 144]],
    ["preset:gb300-sixteen-rack-derived@1.0.0", ["derived", 16, 288, 1152, 144, 288]],
    ["preset:freeform-four-h100-pcie@1.0.0", ["freeform", 0, 1, 4, 0, 0]],
  ]);

  assert.equal(catalog.presets.length, expected.size);
  for (const preset of catalog.presets) {
    let racks = 0;
    let nodes = 0;
    let gpus = 0;
    let switchUnits = 0;
    let switchAsics = 0;
    for (const group of preset.systemGroups) {
      const system = keyed(catalog.systems, `${group.systemRef.id}@${group.systemRef.version}`);
      if (system.formFactor === "rack") racks += group.count;
      nodes += group.count * system.structure.computeUnitCount;
      gpus += group.count * system.structure.computeUnitCount * system.structure.acceleratorsPerComputeUnit;
      switchUnits += group.count * system.structure.switchUnitCount;
      switchAsics += group.count * system.structure.switchUnitCount * system.structure.switchesPerSwitchUnit;
    }
    assert.deepEqual(
      [preset.fidelity, racks, nodes, gpus, switchUnits, switchAsics],
      expected.get(`${preset.id}@${preset.version}`),
      `${preset.id}@${preset.version}`,
    );
  }
});

test("pins the slow-worker scenario to the derived 128-GPU preset", () => {
  const preset = keyed(catalog.presets, "preset:h100-fat-tree-16x8@1.0.0");
  assert.equal(expandedPresetNodeNames(preset, catalog.systems).length, 16);
  const system = keyed(catalog.systems, "system:dgx-h100@1.0.0");
  assert.equal(system.structure.acceleratorsPerComputeUnit * 16, 128);
  const scenario = keyed(catalog.scenarios, "scenario:slow-worker-bandwidth-drop@2.0.0");
  assert.deepEqual(scenario.presetRef, { id: preset.id, version: preset.version });
  assert.deepEqual(scenario.patches, []);
  assert.deepEqual(scenario.events.at(0)?.fault, {
    id: "fault:node03-bandwidth",
    kind: "network.bandwidth_drop",
    target: "node03",
    parameters: { fromGbps: 400, toGbps: 20 },
  });
});

test("allows multiple versions of versioned entities by id@version", () => {
  const candidate = structuredClone(catalog);
  const scenario = keyed(candidate.scenarios, "scenario:slow-worker-bandwidth-drop@2.0.0");
  candidate.scenarios.push({ ...scenario, version: "2.1.0", title: `${scenario.title} revision` });
  assert.equal(validateCatalog(candidate).valid, true);
});

test("uses official source records and declarative validators only", () => {
  assert.ok(catalog.sources.length > 0);
  for (const source of catalog.sources) {
    assert.equal(source.sourceType, "official");
    assert.match(source.url, /^https:\/\//u);
  }
  const sourceById = new Map(catalog.sources.map((source) => [source.id, source]));
  assert.equal(sourceById.get("source:nvidia-gb300-networking")?.url, "https://docs.nvidia.com/enterprise-reference-architectures/nvl72-ai-factory/latest/network-logical-architecture.html");
  assert.equal(sourceById.get("source:pci-sig-pcie5")?.url, "https://pcisig.com/what-bit-rates-does-pcie-50-specification-support-and-how-does-it-compare-prior-pcie-generations");
  const lab = catalog.labs.at(0);
  assert.ok(lab);
  assert.deepEqual(lab.scenarioRef, { id: "scenario:slow-worker-bandwidth-drop", version: "2.0.0" });
  for (const validator of lab.validators) {
    assert.equal(Object.keys(validator).some((key) => ["code", "script", "eval", "command"].includes(key)), false);
  }
});
