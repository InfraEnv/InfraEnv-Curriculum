/** SPDX-License-Identifier: Apache-2.0 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import type {
  CaseMetadata,
  ChapterDefinition,
  ContentCatalog,
  CourseDefinition,
  LabDefinition,
  LearningTopic,
  LessonDefinition,
  KnowledgeConcept,
  ScenarioDefinition,
  SoftwareTool,
} from "./types.js";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const readYaml = (path: string): unknown => parseYaml(readFileSync(path, "utf8"));

function filesBelow(root: string, suffix: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(path, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) result.push(path);
  }
  return result.sort((left, right) => left.localeCompare(right, "en"));
}

function schemaValidator(repositoryRoot: string, definition: string): ValidateFunction {
  const schemaPath = join(repositoryRoot, "schemas", "content.schema.json");
  const schema = readJson<{ $id: string }>(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(schema);
  return ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` });
}

const formatAjvErrors = (path: string, errors: ErrorObject[] | null | undefined): string =>
  (errors ?? [])
    .map((error) => `${relative(process.cwd(), path)}${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("\n");

function loadValidatedYaml<T>(repositoryRoot: string, path: string, definition: string): T {
  const value = readYaml(path);
  const validate = schemaValidator(repositoryRoot, definition);
  if (!validate(value)) throw new Error(`Schema validation failed:\n${formatAjvErrors(path, validate.errors)}`);
  return value as T;
}

export interface LoadContentOptions {
  repositoryRoot?: string;
}

export function loadSourceCatalog(options: LoadContentOptions = {}): ContentCatalog {
  const repositoryRoot = resolve(options.repositoryRoot ?? moduleRoot);
  const contentRoot = join(repositoryRoot, "content");
  const courseRoot = join(contentRoot, "courses");
  const yamlPaths = filesBelow(courseRoot, ".yaml");

  const courses = yamlPaths
    .filter((path) => path.endsWith("course.yaml"))
    .map((path) => loadValidatedYaml<CourseDefinition>(repositoryRoot, path, "course"));
  const chapters = yamlPaths
    .filter((path) => path.split(/[\\/]/u).includes("chapters"))
    .map((path) => loadValidatedYaml<ChapterDefinition>(repositoryRoot, path, "chapter"));
  const lessons = yamlPaths
    .filter((path) => path.split(/[\\/]/u).includes("lessons"))
    .map((path) => loadValidatedYaml<LessonDefinition>(repositoryRoot, path, "lesson"));

  const labs = filesBelow(join(contentRoot, "labs"), ".yaml").map((path) =>
    loadValidatedYaml<LabDefinition>(repositoryRoot, path, "lab"),
  );
  const scenarios = filesBelow(join(contentRoot, "scenarios"), ".yaml").map((path) =>
    loadValidatedYaml<ScenarioDefinition>(repositoryRoot, path, "scenario"),
  );
  const manifestSource = loadValidatedYaml<{
    schemaVersion: string;
    contentVersion: string;
    defaultLocale: "zh-CN";
    supportedLocales: Array<"zh-CN" | "en">;
  }>(repositoryRoot, join(contentRoot, "manifest.yaml"), "manifest");

  return {
    manifest: { ...manifestSource, integrity: {} },
    topics: readJson<LearningTopic[]>(join(contentRoot, "catalog", "topics.json")),
    concepts: readJson<KnowledgeConcept[]>(join(contentRoot, "catalog", "concepts.json")),
    tools: readJson<SoftwareTool[]>(join(contentRoot, "catalog", "tools.json")),
    cases: readJson<CaseMetadata[]>(join(contentRoot, "catalog", "cases.json")),
    courses,
    chapters,
    lessons,
    labs,
    scenarios,
  };
}
