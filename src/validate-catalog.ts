/** SPDX-License-Identifier: Apache-2.0 */
import type { ContentCatalog, NamespacedId, ValidationIssue, ValidationResult } from "./types.js";

const addMissing = (issues: ValidationIssue[], path: string, ids: readonly string[], validIds: Set<string>): void => {
  for (const id of ids) {
    if (!validIds.has(id)) issues.push({ path, message: `Unknown reference ${id}` });
  }
};

const checkUnique = (issues: ValidationIssue[], path: string, ids: readonly string[]): void => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) issues.push({ path, message: `Duplicate ID ${id}` });
    seen.add(id);
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
      if (cycle !== undefined) return cycle;
    }
    path.pop();
    visiting.delete(id);
    visited.add(id);
    return undefined;
  };

  for (const node of nodes) {
    const cycle = walk(node.id);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
}

export function validateCatalog(catalog: ContentCatalog): ValidationResult {
  const issues: ValidationIssue[] = [];
  const groups = [
    catalog.topics,
    catalog.concepts,
    catalog.tools,
    catalog.cases,
    catalog.courses,
    catalog.chapters,
    catalog.lessons,
    catalog.labs,
    catalog.scenarios,
  ] as const;
  const allIds = groups.flatMap((group) => group.map((item) => item.id));
  checkUnique(issues, "catalog", allIds);

  const topicIds = new Set(catalog.topics.map((item) => item.id));
  const conceptIds = new Set(catalog.concepts.map((item) => item.id));
  const toolIds = new Set(catalog.tools.map((item) => item.id));
  const caseIds = new Set(catalog.cases.map((item) => item.id));
  const courseIds = new Set(catalog.courses.map((item) => item.id));
  const chapterIds = new Set(catalog.chapters.map((item) => item.id));
  const lessonIds = new Set(catalog.lessons.map((item) => item.id));
  const labIds = new Set(catalog.labs.map((item) => item.id));
  const scenarioIds = new Set(catalog.scenarios.map((item) => item.id));

  for (const id of allIds) {
    if (!/^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/.test(id)) {
      issues.push({ path: id, message: "ID must use a stable lowercase namespace" });
    }
  }

  for (const topic of catalog.topics) {
    addMissing(issues, `${topic.id}.prerequisiteIds`, topic.prerequisiteIds, topicIds);
    addMissing(issues, `${topic.id}.knowledgeIds`, topic.knowledgeIds, conceptIds);
    addMissing(issues, `${topic.id}.caseIds`, topic.caseIds, caseIds);
    if (topic.resources.length > 3) issues.push({ path: `${topic.id}.resources`, message: "At most three resources are allowed" });
    const resourceTypes = topic.resources.map((resource) => resource.type);
    checkUnique(issues, `${topic.id}.resources.type`, resourceTypes);
    for (const [index, resource] of topic.resources.entries()) {
      if (!resource.url.startsWith("https://")) issues.push({ path: `${topic.id}.resources[${index}].url`, message: "URL must use HTTPS" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(resource.lastVerified)) {
        issues.push({ path: `${topic.id}.resources[${index}].lastVerified`, message: "lastVerified must be YYYY-MM-DD" });
      }
    }
  }

  const topicCycle = findCycle(catalog.topics.map((topic) => ({ id: topic.id, dependencies: topic.prerequisiteIds })));
  if (topicCycle !== undefined) issues.push({ path: "topics", message: `Prerequisite cycle: ${topicCycle.join(" -> ")}` });

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
    addMissing(issues, `${lab.id}.scenarioRef`, [lab.scenarioRef.id], scenarioIds);
    const scenario = catalog.scenarios.find((item) => item.id === lab.scenarioRef.id);
    if (scenario !== undefined && scenario.version !== lab.scenarioRef.version) {
      issues.push({ path: `${lab.id}.scenarioRef.version`, message: `Expected ${scenario.version}` });
    }
    const orders = lab.steps.map((step) => step.order);
    checkUnique(issues, `${lab.id}.steps.order`, orders.map(String));
    if (orders.some((order, index) => order !== index + 1)) issues.push({ path: `${lab.id}.steps`, message: "Step order must be contiguous and start at 1" });
  }

  for (const scenario of catalog.scenarios) {
    if (scenario.cluster.totalGpuCount !== scenario.cluster.nodeCount * scenario.cluster.gpusPerNode) {
      issues.push({ path: `${scenario.id}.cluster.totalGpuCount`, message: "Must equal nodeCount * gpusPerNode" });
    }
    if (!scenario.cluster.gpuModel.includes("SIMULATED") || !scenario.cluster.disclosure.includes("SIMULATED / S2")) {
      issues.push({ path: `${scenario.id}.cluster`, message: "Simulated hardware must be explicitly disclosed" });
    }
    if (scenario.job.nodeCount > scenario.cluster.nodeCount) issues.push({ path: `${scenario.id}.job.nodeCount`, message: "Job cannot use more nodes than the cluster" });
    for (const event of scenario.events) {
      if (event.fault.parameters.toGbps >= event.fault.parameters.fromGbps) {
        issues.push({ path: `${scenario.id}.${event.id}`, message: "Bandwidth-drop target must be lower than baseline" });
      }
      const targetNumber = Number.parseInt(event.fault.target.replace(/^node/, ""), 10);
      if (!Number.isInteger(targetNumber) || targetNumber < 0 || targetNumber >= scenario.cluster.nodeCount) {
        issues.push({ path: `${scenario.id}.${event.id}.fault.target`, message: "Fault target is outside cluster bounds" });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertNamespacedId(id: string): asserts id is NamespacedId {
  if (!/^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid namespaced ID: ${id}`);
}

