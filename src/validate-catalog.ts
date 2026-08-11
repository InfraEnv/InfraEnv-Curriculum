/** SPDX-License-Identifier: Apache-2.0 */
import type {
  ClusterPresetDefinition,
  ComputeSystemProfile,
  ContentCatalog,
  NamespacedId,
  ValidationIssue,
  ValidationResult,
  VersionedRef,
} from "./types.js";

const versionKey = (value: { id: string; version: string }): string => `${value.id}@${value.version}`;

const addMissing = (issues: ValidationIssue[], path: string, ids: readonly string[], validIds: Set<string>): void => {
  for (const id of ids) if (!validIds.has(id)) issues.push({ path, message: `Unknown reference ${id}` });
};

const checkUnique = (issues: ValidationIssue[], path: string, ids: readonly string[]): void => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) issues.push({ path, message: `Duplicate identity ${id}` });
    seen.add(id);
  }
};

const checkContiguousOrder = (
  issues: ValidationIssue[],
  path: string,
  values: Array<{ id: string; order: number }>,
): void => {
  checkUnique(issues, `${path}.id`, values.map((item) => item.id));
  checkUnique(issues, `${path}.order`, values.map((item) => String(item.order)));
  const sorted = [...values].sort((left, right) => left.order - right.order);
  if (sorted.some((item, index) => item.order !== index + 1)) {
    issues.push({ path, message: "Order must be contiguous and start at 1" });
  }
};

function findCycle(nodes: Array<{ id: string; dependencies: string[] }>): string[] | undefined {
  const graph = new Map(nodes.map((node) => [node.id, node.dependencies]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const walk = (id: string): string[] | undefined => {
    if (visiting.has(id)) return [...path.slice(path.indexOf(id)), id];
    if (visited.has(id)) return undefined;
    visiting.add(id);
    path.push(id);
    for (const dependency of graph.get(id) ?? []) {
      const cycle = walk(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    visiting.delete(id);
    visited.add(id);
    return undefined;
  };
  for (const node of nodes) {
    const cycle = walk(node.id);
    if (cycle) return cycle;
  }
  return undefined;
}

function sourceReferences(
  issues: ValidationIssue[],
  owner: string,
  sourceIds: readonly string[],
  validIds: Set<string>,
): void {
  addMissing(issues, `${owner}.sourceIds`, sourceIds, validIds);
  checkUnique(issues, `${owner}.sourceIds`, sourceIds);
}

function formatPattern(pattern: string, values: number[]): string {
  let index = 0;
  return pattern.replace(/%0?(\d*)d/gu, (_match, widthText: string) => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;
    const width = Number.parseInt(widthText || "0", 10);
    return width > 0 ? String(value).padStart(width, "0") : String(value);
  });
}

function systemFor(
  ref: VersionedRef<`system:${string}`>,
  systems: ComputeSystemProfile[],
): ComputeSystemProfile | undefined {
  return systems.find((candidate) => versionKey(candidate) === versionKey(ref));
}

export function expandedPresetNodeNames(
  preset: ClusterPresetDefinition,
  systems: ComputeSystemProfile[],
): string[] {
  return preset.systemGroups.flatMap((group) => {
    const system = systemFor(group.systemRef, systems);
    if (!system) return [];
    return Array.from({ length: group.count }, (_, instanceIndex) =>
      Array.from({ length: system.structure.computeUnitCount }, (_, nodeIndex) =>
        formatPattern(group.nodeNamePattern, [instanceIndex, nodeIndex]),
      ),
    ).flat();
  });
}

export function validateCatalog(catalog: ContentCatalog): ValidationResult {
  const issues: ValidationIssue[] = [];
  const nonVersionedGroups = [
    catalog.topics,
    catalog.concepts,
    catalog.tools,
    catalog.cases,
    catalog.sources,
    catalog.courses,
    catalog.chapters,
    catalog.lessons,
    catalog.labs,
  ] as const;
  const versionedGroups = [
    catalog.accelerators,
    catalog.fabrics,
    catalog.systems,
    catalog.bootProfiles,
    catalog.presets,
    catalog.scenarios,
  ] as const;
  checkUnique(issues, "catalog.ids", nonVersionedGroups.flatMap((group) => group.map((item) => item.id)));
  for (const group of versionedGroups) checkUnique(issues, "catalog.versioned", group.map(versionKey));
  const everyId = [
    ...nonVersionedGroups.flatMap((group) => group.map((item) => item.id)),
    ...versionedGroups.flatMap((group) => group.map((item) => item.id)),
  ];
  for (const id of everyId) {
    if (!/^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/u.test(id)) {
      issues.push({ path: id, message: "ID must use a stable lowercase namespace" });
    }
  }

  const topicIds = new Set(catalog.topics.map((item) => item.id));
  const conceptIds = new Set(catalog.concepts.map((item) => item.id));
  const toolIds = new Set(catalog.tools.map((item) => item.id));
  const caseIds = new Set(catalog.cases.map((item) => item.id));
  const sourceIds = new Set(catalog.sources.map((item) => item.id));
  const acceleratorVersions = new Set(catalog.accelerators.map(versionKey));
  const fabricVersions = new Set(catalog.fabrics.map(versionKey));
  const systemVersions = new Set(catalog.systems.map(versionKey));
  const bootVersions = new Set(catalog.bootProfiles.map(versionKey));
  const presetVersions = new Set(catalog.presets.map(versionKey));
  const courseIds = new Set(catalog.courses.map((item) => item.id));
  const chapterIds = new Set(catalog.chapters.map((item) => item.id));
  const lessonIds = new Set(catalog.lessons.map((item) => item.id));
  const labIds = new Set(catalog.labs.map((item) => item.id));
  const scenarioVersions = new Set(catalog.scenarios.map(versionKey));

  for (const source of catalog.sources) {
    if (!source.url.startsWith("https://")) issues.push({ path: `${source.id}.url`, message: "Source URL must use HTTPS" });
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(source.verifiedAt)) issues.push({ path: `${source.id}.verifiedAt`, message: "verifiedAt must be YYYY-MM-DD" });
  }

  for (const topic of catalog.topics) {
    addMissing(issues, `${topic.id}.prerequisiteIds`, topic.prerequisiteIds, topicIds);
    addMissing(issues, `${topic.id}.knowledgeIds`, topic.knowledgeIds, conceptIds);
    addMissing(issues, `${topic.id}.caseIds`, topic.caseIds, caseIds);
    if (topic.resources.length > 3) issues.push({ path: `${topic.id}.resources`, message: "At most three resources are allowed" });
    checkUnique(issues, `${topic.id}.resources.type`, topic.resources.map((resource) => resource.type));
    for (const [index, resource] of topic.resources.entries()) {
      if (!resource.url.startsWith("https://")) issues.push({ path: `${topic.id}.resources[${index}].url`, message: "URL must use HTTPS" });
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(resource.lastVerified)) issues.push({ path: `${topic.id}.resources[${index}].lastVerified`, message: "lastVerified must be YYYY-MM-DD" });
    }
  }
  const topicCycle = findCycle(catalog.topics.map((topic) => ({ id: topic.id, dependencies: topic.prerequisiteIds })));
  if (topicCycle) issues.push({ path: "topics", message: `Prerequisite cycle: ${topicCycle.join(" -> ")}` });

  for (const concept of catalog.concepts) {
    addMissing(issues, `${concept.id}.prerequisites`, concept.prerequisites, conceptIds);
    addMissing(issues, `${concept.id}.next`, concept.next, conceptIds);
    addMissing(issues, `${concept.id}.resourceIds`, concept.resourceIds, topicIds);
    addMissing(issues, `${concept.id}.toolIds`, concept.toolIds, toolIds);
    addMissing(issues, `${concept.id}.caseIds`, concept.caseIds, caseIds);
  }
  for (const tool of catalog.tools) {
    addMissing(issues, `${tool.id}.knowledgeIds`, tool.knowledgeIds, conceptIds);
    addMissing(issues, `${tool.id}.caseIds`, tool.caseIds, caseIds);
    for (const [key, value] of [["website", tool.website], ["docs", tool.docs], ["github", tool.github]] as const) {
      if (value !== undefined && !value.startsWith("https://")) issues.push({ path: `${tool.id}.${key}`, message: "URL must use HTTPS" });
    }
  }
  for (const study of catalog.cases) {
    addMissing(issues, `${study.id}.prerequisiteIds`, study.prerequisiteIds, topicIds);
    addMissing(issues, `${study.id}.toolIds`, study.toolIds, toolIds);
  }

  for (const accelerator of catalog.accelerators) {
    sourceReferences(issues, versionKey(accelerator), accelerator.sourceIds, sourceIds);
    if (!accelerator.disclosure.includes("SIMULATED")) issues.push({ path: `${versionKey(accelerator)}.disclosure`, message: "Accelerator profile must disclose simulation" });
  }
  for (const fabric of catalog.fabrics) sourceReferences(issues, versionKey(fabric), fabric.sourceIds, sourceIds);
  for (const system of catalog.systems) {
    sourceReferences(issues, versionKey(system), system.sourceIds, sourceIds);
    addMissing(issues, `${versionKey(system)}.acceleratorRef`, [versionKey(system.acceleratorRef)], acceleratorVersions);
    addMissing(issues, `${versionKey(system)}.intraSystemFabricRefs`, system.intraSystemFabricRefs.map(versionKey), fabricVersions);
    const totalAccelerators = system.structure.computeUnitCount * system.structure.acceleratorsPerComputeUnit;
    if (system.structure.nvlinkDomainSize > totalAccelerators) issues.push({ path: `${versionKey(system)}.structure.nvlinkDomainSize`, message: "NVLink domain cannot exceed accelerator count" });
    const hasSwitchUnits = system.structure.switchUnitCount > 0;
    if (hasSwitchUnits !== (system.structure.switchesPerSwitchUnit > 0)) issues.push({ path: `${versionKey(system)}.structure`, message: "Switch unit counts must both be zero or both be positive" });
    if ((system.structure.intraSystemTopology === "nvswitch") !== hasSwitchUnits) issues.push({ path: `${versionKey(system)}.structure.intraSystemTopology`, message: "NVSwitch topology must agree with switch-unit inventory" });
    const hasBridgeAssemblies = (system.structure.nvlinkBridgeAssembliesPerAccelerator ?? 0) > 0;
    if ((system.structure.intraSystemTopology === "nvlink-bridge-pair") !== hasBridgeAssemblies) issues.push({ path: `${versionKey(system)}.structure.nvlinkBridgeAssembliesPerAccelerator`, message: "Physical bridge assemblies are only valid and required for an NVLink bridge pair" });
    if (system.fidelity === "freeform" && !system.disclosure.includes("USER-COMPOSABLE")) issues.push({ path: `${versionKey(system)}.disclosure`, message: "Freeform systems must be clearly marked user-composable" });
  }
  for (const boot of catalog.bootProfiles) {
    sourceReferences(issues, versionKey(boot), boot.sourceIds, sourceIds);
    checkContiguousOrder(issues, `${versionKey(boot)}.phases`, boot.phases);
    if (!boot.disclosure.includes("SIMULATED")) issues.push({ path: `${versionKey(boot)}.disclosure`, message: "Boot profile must disclose simulated output" });
  }

  const presetNodes = new Map<string, string[]>();
  for (const preset of catalog.presets) {
    const identity = versionKey(preset);
    sourceReferences(issues, identity, preset.sourceIds, sourceIds);
    addMissing(issues, `${identity}.bootProfileRef`, [versionKey(preset.bootProfileRef)], bootVersions);
    checkUnique(issues, `${identity}.systemGroups`, preset.systemGroups.map((group) => group.id));
    checkUnique(issues, `${identity}.fabrics`, preset.fabrics.map((fabric) => fabric.id));
    const groupIds = new Set(preset.systemGroups.map((group) => group.id));
    for (const group of preset.systemGroups) addMissing(issues, `${identity}.${group.id}.systemRef`, [versionKey(group.systemRef)], systemVersions);
    for (const fabric of preset.fabrics) {
      addMissing(issues, `${identity}.${fabric.id}.fabricRef`, [versionKey(fabric.fabricRef)], fabricVersions);
      addMissing(issues, `${identity}.${fabric.id}.connectsGroupIds`, fabric.connectsGroupIds, groupIds);
      const profile = catalog.fabrics.find((candidate) => versionKey(candidate) === versionKey(fabric.fabricRef));
      if (profile && fabric.capacityGbps > profile.theoreticalBandwidthGbps) issues.push({ path: `${identity}.${fabric.id}.capacityGbps`, message: "Capacity cannot exceed the referenced theoretical fabric rate" });
    }
    const [minimum, maximum] = preset.performanceModel.efficiencyRange;
    if (minimum === undefined || maximum === undefined || minimum > maximum) issues.push({ path: `${identity}.performanceModel.efficiencyRange`, message: "Efficiency range must be ascending" });
    if (!preset.disclosure.includes("SIMULATED / S2")) issues.push({ path: `${identity}.disclosure`, message: "Preset must disclose SIMULATED / S2" });
    if (preset.fidelity === "freeform" && !preset.disclosure.includes("FREEFORM")) issues.push({ path: `${identity}.disclosure`, message: "Freeform preset must be explicitly marked FREEFORM" });
    const names = expandedPresetNodeNames(preset, catalog.systems);
    checkUnique(issues, `${identity}.expandedNodeNames`, names);
    presetNodes.set(identity, names);
  }

  for (const course of catalog.courses) addMissing(issues, `${course.id}.chapterIds`, course.chapterIds, chapterIds);
  for (const chapter of catalog.chapters) {
    addMissing(issues, `${chapter.id}.courseId`, [chapter.courseId], courseIds);
    addMissing(issues, `${chapter.id}.lessonIds`, chapter.lessonIds, lessonIds);
  }
  for (const lesson of catalog.lessons) {
    addMissing(issues, `${lesson.id}.chapterId`, [lesson.chapterId], chapterIds);
    addMissing(issues, `${lesson.id}.prerequisiteTopicIds`, lesson.prerequisiteTopicIds, topicIds);
    addMissing(issues, `${lesson.id}.teachesConceptIds`, lesson.teachesConceptIds, conceptIds);
    addMissing(issues, `${lesson.id}.usesToolIds`, lesson.usesToolIds, toolIds);
    addMissing(issues, `${lesson.id}.labIds`, lesson.labIds, labIds);
  }
  for (const lab of catalog.labs) {
    addMissing(issues, `${lab.id}.lessonId`, [lab.lessonId], lessonIds);
    addMissing(issues, `${lab.id}.scenarioRef`, [versionKey(lab.scenarioRef)], scenarioVersions);
    checkContiguousOrder(issues, `${lab.id}.steps`, lab.steps);
    checkUnique(issues, `${lab.id}.validators`, lab.validators.map((validator) => validator.id));
  }

  for (const scenario of catalog.scenarios) {
    const identity = versionKey(scenario);
    addMissing(issues, `${identity}.presetRef`, [versionKey(scenario.presetRef)], presetVersions);
    checkUnique(issues, `${identity}.patches`, scenario.patches.map((patch) => patch.id));
    checkUnique(issues, `${identity}.events`, scenario.events.map((event) => event.id));
    const nodes = new Set(presetNodes.get(versionKey(scenario.presetRef)) ?? []);
    if (scenario.job && scenario.job.nodeCount > nodes.size) issues.push({ path: `${identity}.job.nodeCount`, message: "Job cannot use more nodes than the preset expands" });
    let lastAt = -1;
    for (const event of scenario.events) {
      if (event.atSeconds < lastAt) issues.push({ path: `${identity}.events`, message: "Events must be sorted by atSeconds" });
      lastAt = event.atSeconds;
      if (event.fault.parameters.toGbps >= event.fault.parameters.fromGbps) issues.push({ path: `${identity}.${event.id}`, message: "Bandwidth-drop target must be lower than baseline" });
      if (!nodes.has(event.fault.target)) issues.push({ path: `${identity}.${event.id}.fault.target`, message: "Fault target is outside the resolved preset" });
    }
    for (const patch of scenario.patches) {
      if (patch.op === "set-device-health" && !nodes.has(patch.target)) issues.push({ path: `${identity}.${patch.id}.target`, message: "Device-health patch target is outside the resolved preset" });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertNamespacedId(id: string): asserts id is NamespacedId {
  if (!/^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/u.test(id)) throw new Error(`Invalid namespaced ID: ${id}`);
}
