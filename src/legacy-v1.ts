/** SPDX-License-Identifier: Apache-2.0 */
import type {
  BootProfileDefinition,
  ClusterPresetDefinition,
  ComputeSystemProfile,
  FabricProfile,
  JobDefinition,
  ScenarioDefinition,
  ScenarioEvent,
  SimulationLevel,
  VersionedRef,
} from "./types.js";

export interface LegacyScenarioV1 {
  id: `scenario:${string}`;
  version: string;
  title: string;
  seed: number;
  minRuntimeVersion: string;
  requiredCapabilities: string[];
  simulationLevel: SimulationLevel;
  clock: "deterministic-virtual";
  cluster: {
    nodeCount: number;
    nodeNamePattern: string;
    gpusPerNode: number;
    gpuModel: string;
    totalGpuCount: number;
    baselineNetworkGbps: number;
    topology: "fat-tree" | "ring" | "mesh";
    disclosure: string;
  };
  job: JobDefinition;
  events: ScenarioEvent[];
  causalModel: Array<{ from: string; to: string; relation: string }>;
}

export interface AdaptScenarioV1Options {
  scenarioVersion: string;
  presetId: `preset:${string}`;
  presetVersion: string;
  presetSlug: string;
  systemRef: VersionedRef<ComputeSystemProfile["id"]>;
  fabricRef: VersionedRef<FabricProfile["id"]>;
  bootProfileRef: VersionedRef<BootProfileDefinition["id"]>;
  sourceIds: `source:${string}`[];
}

export interface AdaptedScenarioV1 {
  preset: ClusterPresetDefinition;
  scenario: ScenarioDefinition;
}

/**
 * Converts the original uniform v1 cluster shape into the v2 preset/scenario
 * split. It is intentionally pure and never loads executable migration code
 * from curriculum content.
 */
export function adaptScenarioV1(
  legacy: LegacyScenarioV1,
  options: AdaptScenarioV1Options,
): AdaptedScenarioV1 {
  if (legacy.cluster.totalGpuCount !== legacy.cluster.nodeCount * legacy.cluster.gpusPerNode) {
    throw new Error("Legacy scenario totalGpuCount is inconsistent.");
  }
  const groupId = "group:legacy-compute" as const;
  const topology = legacy.cluster.topology === "fat-tree" ? "fat-tree" : legacy.cluster.topology;
  const preset: ClusterPresetDefinition = {
    id: options.presetId,
    version: options.presetVersion,
    slug: options.presetSlug,
    title: `${legacy.title} legacy cluster preset`,
    fidelity: "derived",
    simulationLevel: "S2",
    minRuntimeVersion: legacy.minRuntimeVersion,
    requiredCapabilities: ["hierarchical-inventory-v1", "deterministic-performance-v1"],
    seed: legacy.seed,
    systemGroups: [{
      id: groupId,
      systemRef: options.systemRef,
      count: legacy.cluster.nodeCount,
      systemNamePattern: legacy.cluster.nodeNamePattern,
      nodeNamePattern: legacy.cluster.nodeNamePattern,
    }],
    fabrics: [{
      id: "fabric-instance:legacy-scale-out",
      fabricRef: options.fabricRef,
      topology,
      connectsGroupIds: [groupId],
      capacityGbps: legacy.cluster.baselineNetworkGbps,
      oversubscriptionRatio: 1,
    }],
    bootProfileRef: options.bootProfileRef,
    performanceModel: {
      modelVersion: "analytical-v1",
      efficiencyRange: [0.82, 0.94],
      jitterPercent: 2,
      disclosure: "Deterministic analytical compatibility model; not a real benchmark.",
    },
    optionalServices: [],
    sourceIds: options.sourceIds,
    disclosure: legacy.cluster.disclosure,
  };
  return {
    preset,
    scenario: {
      id: legacy.id,
      version: options.scenarioVersion,
      title: legacy.title,
      presetRef: { id: preset.id, version: preset.version },
      seed: legacy.seed,
      minRuntimeVersion: legacy.minRuntimeVersion,
      requiredCapabilities: [...legacy.requiredCapabilities, "preset-scenario-v2"],
      simulationLevel: legacy.simulationLevel,
      clock: legacy.clock,
      patches: [],
      job: structuredClone(legacy.job),
      events: structuredClone(legacy.events),
      causalModel: structuredClone(legacy.causalModel),
    },
  };
}
