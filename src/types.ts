/** SPDX-License-Identifier: Apache-2.0 */

export type NamespacedId = `${string}:${string}`;
export type Locale = "zh-CN" | "en";
export type Stage = "foundations" | "systems-parallel" | "gpu-infra";
export type Direction =
  | "parallel"
  | "hpc"
  | "gpu"
  | "distributed-training"
  | "inference"
  | "network-cluster";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type KnowledgeLayer = "foundation" | "systems" | "parallel" | "cluster" | "ai-infra";
export type SoftwareCategory =
  | "compiler-build"
  | "parallel"
  | "gpu"
  | "communication"
  | "framework"
  | "operator-inference"
  | "environment"
  | "observability"
  | "scheduler";
export type SoftwareStatus = "active" | "mature" | "legacy";
export type SoftwareEcosystem =
  | "cross-platform"
  | "nvidia"
  | "amd"
  | "intel"
  | "linux"
  | "cloud-native";
export type SimulationLevel = "S0" | "S1" | "S2" | "S3" | "S4";

export interface ResourceLink {
  title: string;
  url: string;
  type: "primary" | "supplemental" | "official";
  language: "zh" | "en";
  note: string;
  lastVerified: string;
}

export interface LearningTopic {
  id: `topic:${string}`;
  slug: string;
  title: string;
  englishTitle: string;
  stage: Stage;
  directions: Direction[];
  summary: string;
  outcome: string;
  duration: string;
  hardware: string;
  prerequisiteIds: `topic:${string}`[];
  knowledgeIds: `concept:${string}`[];
  caseIds: `case:${string}`[];
  resources: ResourceLink[];
}

export interface KnowledgeConcept {
  id: `concept:${string}`;
  slug: string;
  label: string;
  englishLabel: string;
  layer: KnowledgeLayer;
  summary: string;
  why: string;
  prerequisites: `concept:${string}`[];
  next: `concept:${string}`[];
  resourceIds: `topic:${string}`[];
  toolIds: `tool:${string}`[];
  caseIds: `case:${string}`[];
}

export interface SoftwareTool {
  id: `tool:${string}`;
  slug: string;
  name: string;
  category: SoftwareCategory;
  summary: string;
  useCase: string;
  difficulty: Difficulty;
  status: SoftwareStatus;
  ecosystems: SoftwareEcosystem[];
  website: string;
  docs: string;
  github?: string;
  knowledgeIds: `concept:${string}`[];
  caseIds: `case:${string}`[];
}

export interface CaseMetadata {
  id: `case:${string}`;
  slug: string;
  title: string;
  englishTitle: string;
  category: "systems" | "parallel" | "gpu" | "communication";
  difficulty: Difficulty;
  duration: string;
  environment: string;
  hardware: string;
  summary: string;
  outcomes: string[];
  prerequisiteIds: `topic:${string}`[];
  toolIds: `tool:${string}`[];
  bodyAsset: string;
}

export interface ContentManifest {
  schemaVersion: string;
  contentVersion: string;
  defaultLocale: "zh-CN";
  supportedLocales: Locale[];
  integrity: Record<string, string>;
}

export interface CourseDefinition {
  id: `course:${string}`;
  slug: string;
  title: string;
  englishTitle: string;
  summary: string;
  audience: string;
  chapterIds: `chapter:${string}`[];
}

export interface ChapterDefinition {
  id: `chapter:${string}`;
  slug: string;
  courseId: `course:${string}`;
  title: string;
  englishTitle: string;
  summary: string;
  lessonIds: `lesson:${string}`[];
}

export interface LessonDefinition {
  id: `lesson:${string}`;
  slug: string;
  chapterId: `chapter:${string}`;
  title: string;
  englishTitle: string;
  summary: string;
  duration: string;
  bodyAsset: string;
  prerequisiteTopicIds: `topic:${string}`[];
  teachesConceptIds: `concept:${string}`[];
  usesToolIds: `tool:${string}`[];
  labIds: `lab:${string}`[];
}

export interface RuntimeRequirements {
  node: ">=22";
  docker: ">=26";
  operatingSystems: string[];
  cpuCores: number;
  memoryMiB: number;
  diskMiB: number;
  realGpuRequired: false;
  networkAccessDuringLab: false;
}

export type LabStepKind = "command" | "observe" | "diagnose" | "repair" | "submit";

export interface LabStep {
  id: `step:${string}`;
  order: number;
  kind: LabStepKind;
  title: string;
  instruction: string;
  command?: string;
  expectedObservation: string;
  hint: string;
}

export type DeclarativeValidator =
  | {
      id: `validator:${string}`;
      kind: "observation-recorded";
      observation: "metrics.network" | "metrics.gpu" | "node.inspect";
    }
  | {
      id: `validator:${string}`;
      kind: "target-inspected";
      target: string;
    }
  | {
      id: `validator:${string}`;
      kind: "diagnosis-matches";
      rootCause: string;
      target: string;
    }
  | {
      id: `validator:${string}`;
      kind: "fault-state";
      faultId: `fault:${string}`;
      state: "active" | "cleared";
    }
  | {
      id: `validator:${string}`;
      kind: "metric-threshold";
      metric: string;
      operator: "gte" | "lte";
      value: number;
      unit: string;
    };

export interface LabDefinition {
  id: `lab:${string}`;
  slug: string;
  title: string;
  lessonId: `lesson:${string}`;
  scenarioRef: { id: `scenario:${string}`; version: string };
  simulationLevel: SimulationLevel;
  requirements: RuntimeRequirements;
  allowedUiActions: Array<"pause" | "resume" | "reset" | "inject-listed-fault" | "clear-listed-fault">;
  steps: LabStep[];
  validators: DeclarativeValidator[];
}

export interface ClusterDefinition {
  nodeCount: number;
  nodeNamePattern: string;
  gpusPerNode: number;
  gpuModel: string;
  totalGpuCount: number;
  baselineNetworkGbps: number;
  topology: "fat-tree" | "ring" | "mesh";
  disclosure: string;
}

export interface JobDefinition {
  id: `job:${string}`;
  name: string;
  framework: string;
  nodeCount: number;
  workersPerNode: number;
  baselineStepTimeMs: number;
  baselineThroughputSamplesPerSecond: number;
}

export interface FaultDefinition {
  id: `fault:${string}`;
  kind: "network.bandwidth_drop";
  target: string;
  parameters: {
    fromGbps: number;
    toGbps: number;
  };
}

export interface ScenarioEvent {
  id: `event:${string}`;
  atSeconds: number;
  type: "fault.activate";
  fault: FaultDefinition;
}

export interface ScenarioDefinition {
  id: `scenario:${string}`;
  version: string;
  title: string;
  seed: number;
  minRuntimeVersion: string;
  requiredCapabilities: string[];
  simulationLevel: SimulationLevel;
  clock: "deterministic-virtual";
  cluster: ClusterDefinition;
  job: JobDefinition;
  events: ScenarioEvent[];
  causalModel: Array<{ from: string; to: string; relation: string }>;
}

export interface ContentCatalog {
  manifest: ContentManifest;
  topics: LearningTopic[];
  concepts: KnowledgeConcept[];
  tools: SoftwareTool[];
  cases: CaseMetadata[];
  courses: CourseDefinition[];
  chapters: ChapterDefinition[];
  lessons: LessonDefinition[];
  labs: LabDefinition[];
  scenarios: ScenarioDefinition[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

