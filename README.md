# InfraEnv Curriculum

`@infraenv/curriculum` is the versioned source of truth shared by EasyInfra and the InfraEnv runtime. Version `0.2.0-alpha.0` uses Content Schema `2.0.0`, Node.js 22+, strict TypeScript and ESM.

## Repository and license boundary

- Compiler, schemas, adapters, scripts and tests: Apache-2.0.
- Everything under `content/`: CC BY 4.0.
- EasyInfra-only positions, icons and colors do not belong here.

The semantic catalog remains backward-compatible at the URL/content level: 27 topics, 57 concepts, 44 tools, five cases and their existing slugs are preserved.

## V2 infrastructure model

Versioned entities use exact `{ id, version }` references. Their effective identity is `id@version`; a logical ID may have multiple immutable versions.

```text
SourceRecord
  ├─ AcceleratorProfile
  ├─ FabricProfile
  ├─ ComputeSystemProfile
  └─ BootProfileDefinition
             ↓
      ClusterPresetDefinition
             ↓ exact presetRef
        ScenarioDefinition
             ↓ exact scenarioRef
          LabDefinition
```

Preset fidelity is explicit:

- `exact`: published structural counts and interconnect boundaries are locked.
- `derived`: composed from sourced building blocks but not labeled as an official reference layout.
- `freeform`: user-composable and explicitly marked as not physically validated.

All runtime values remain `SIMULATED / S2`. Published theoretical ceilings are kept separate from deterministic modeled efficiency and jitter. NVLink and NVSwitch generations are separate profiles, and shared memory is described per SM rather than as card-wide SRAM.

The built-in catalog includes separate A100 PCIe and SXM profiles; exact A100 PCIe Pair, HGX A100 4-GPU and DGX A100 8-GPU templates; DGX H100/B200; GB200 NVL72 and its eight-rack SuperPOD scalable unit; GB300 one/two/four/eight-rack reference layouts; a derived sixteen-rack GB300 composition; and a clearly marked freeform playground starter.

`Find Slow Worker` is now:

```text
preset:h100-fat-tree-16x8@1.0.0
  + scenario:slow-worker-bandwidth-drop@2.0.0
  + lab:find-slow-worker
```

The old v1 uniform-cluster Scenario is frozen under `tests/fixtures/` and covered by the pure `adaptScenarioV1` compatibility adapter.

## Safe lesson content

Lesson prose remains restricted MDX. Imports, exports, JavaScript expressions, expression-valued attributes and unknown components are rejected. The build also compiles each lesson into a data-only `PortableLessonDocument` containing a closed union of Markdown blocks and approved course components. Runtime consumers render this JSON without evaluating MDX or curriculum-provided code.

## Deterministic consumer profiles

Run:

```bash
npm install
npm run check
```

The build writes self-contained profiles:

```text
dist/profiles/easyinfra/
  catalog.json
  content-manifest.json
  profile-manifest.json
  mdx/**
  contracts/{content.schema.json,content-contract.d.ts}
  LICENSE-CONTENT / LICENSE-CODE / ATTRIBUTION.md

dist/profiles/runtime/
  catalog.json
  content-manifest.json
  profile-manifest.json
  mdx/lessons/**
  lesson-documents/*.json
  contracts/{content.schema.json,content-contract.d.ts}
  LICENSE-CONTENT / LICENSE-CODE / ATTRIBUTION.md
```

`content-manifest.json` records every source content checksum. Each profile's `profile-manifest.json` separately records the checksum of every distributed artifact, so a published-package consumer does not need access to the source repository. Both consumer snapshots remain generated `DO NOT EDIT` data.

No hardware profile, boot message, command output or modeled metric is real telemetry, certification, measured performance or evidence of NVIDIA endorsement.
