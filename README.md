# InfraEnv Curriculum

`@infraenv/curriculum` is the versioned source of truth shared by the EasyInfra learning site and the InfraEnv simulation runtime. It keeps teaching prose, semantic catalogs, executable-looking instructions, scenarios, and declarative completion rules synchronized without allowing curriculum content to execute arbitrary code.

Version: `0.1.0-alpha.0` · Node.js: `22+` · package format: strict TypeScript / ESM.

## Repository boundary

- Code, schemas, compiler, scripts, and tests: Apache-2.0.
- Everything below `content/`, including MDX, scenarios, labs, and educational assets: CC BY 4.0.
- Presentation overlays such as React Flow positions, icon identifiers, and brand colors belong to EasyInfra and are intentionally absent here.

The initial migration preserves all existing EasyInfra semantic material: 27 learning topics, 57 knowledge concepts, 44 software tools, five case records, five complete case MDX files, and their resource links.

## Content model

Stable entity IDs use namespaces (`topic:`, `concept:`, `tool:`, `case:`, `course:`, `chapter:`, `lesson:`, `lab:`, `scenario:`). Slugs are separate and may be used in URLs without becoming relationship keys.

- `content/catalog/*.json` contains the migrated semantic catalog.
- `content/courses/**.yaml`, `content/labs/*.yaml`, and `content/scenarios/*.yaml` contain structured curriculum and runtime instructions.
- `content/mdx/` contains prose. MDX allows only `Callout`, `Command`, `LabStep`, `Observation`, `FaultAction`, and `Quiz`; imports, exports, expressions, spreads, and unknown components are rejected.
- `schemas/content.schema.json` is the Ajv/JSON Schema contract.

Lab validators are a closed declarative union. Content cannot provide JavaScript, Python, modules, hooks, shell validators, or lifecycle scripts.

## Consumer snapshots

Run:

```bash
npm install
npm run check
```

The deterministic build writes:

```text
dist/
├── catalog.json
├── content-manifest.json
├── catalog.js / catalog.d.ts
├── manifest.js / manifest.d.ts
└── profiles/
    ├── easyinfra/
    │   ├── catalog.json
    │   ├── content-manifest.json
    │   └── mdx/{cases,lessons}/...
    └── runtime/
        ├── catalog.json
        ├── content-manifest.json
        └── mdx/lessons/...
```

Before an npm release, EasyInfra and InfraEnv copy the appropriate sibling profile into a committed, versioned `DO NOT EDIT` snapshot and verify every entry against `manifest.integrity`. After publication they can pin the exact package version. The full EasyInfra `catalog.json` shape is:

```ts
interface ContentCatalog {
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
```

Future package consumers can import `@infraenv/curriculum/catalog`; the pre-release local workflow consumes the JSON and restricted MDX profile directly.

## First lab: Find Slow Worker

The first course is `AI Infrastructure Operations → Distributed Training Diagnostics → Find the Slow Worker`. Its S2 scenario defines 16 logical nodes with eight explicitly simulated H100 GPUs each. At virtual T+40 seconds, `node03` drops from 400 Gbps to 20 Gbps. Structured steps lead the learner through scheduler state, network and GPU evidence, node inspection, diagnosis, repair, and final metric-based validation.

No value in this curriculum is a measurement of real NVIDIA hardware or a claim of real HPC performance.

