/**
 * SPDX-License-Identifier: Apache-2.0
 * One-time helper for importing the original EasyInfra semantic catalog.
 * It deliberately removes site-only layout and brand presentation fields.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sourceRoot = resolve(process.argv[3] ?? "../easyinfra/src/content");
const section = process.argv[2];

const load = async <T>(file: string, exportName: string): Promise<T> => {
  const module = (await import(pathToFileURL(resolve(sourceRoot, file)).href)) as Record<string, T>;
  const value = module[exportName];
  if (value === undefined) throw new Error(`Missing export ${exportName} in ${file}`);
  return value;
};

const topicId = (id: string) => `topic:${id}`;
const conceptId = (id: string) => `concept:${id}`;
const toolId = (id: string) => `tool:${id}`;
const caseId = (id: string) => `case:${id}`;

let result: unknown;

switch (section) {
  case "topics": {
    const topics = await load<Array<Record<string, unknown>>>("learning-topics.ts", "learningTopics");
    result = topics.map((topic) => ({
      ...topic,
      id: topicId(String(topic.id)),
      slug: String(topic.id),
      prerequisiteIds: (topic.prerequisiteIds as string[]).map(topicId),
      knowledgeIds: (topic.knowledgeIds as string[]).map(conceptId),
      caseIds: (topic.caseIds as string[]).map(caseId),
    }));
    break;
  }
  case "concepts": {
    const concepts = await load<Array<Record<string, unknown>>>("knowledge-nodes.ts", "knowledgeNodes");
    result = concepts.map(({ position: _position, ...concept }) => ({
      ...concept,
      id: conceptId(String(concept.id)),
      slug: String(concept.id),
      prerequisites: (concept.prerequisites as string[]).map(conceptId),
      next: (concept.next as string[]).map(conceptId),
      resourceIds: (concept.resourceIds as string[]).map(topicId),
      toolIds: (concept.toolIds as string[]).map(toolId),
      caseIds: (concept.caseIds as string[]).map(caseId),
    }));
    break;
  }
  case "tools": {
    const tools = await load<Array<Record<string, unknown>>>("software-tools.ts", "softwareTools");
    result = tools.map(({ iconSlug: _iconSlug, brandColor: _brandColor, ...tool }) => ({
      ...tool,
      id: toolId(String(tool.slug)),
      knowledgeIds: (tool.knowledgeIds as string[]).map(conceptId),
      caseIds: (tool.caseIds as string[]).map(caseId),
    }));
    break;
  }
  case "cases": {
    const cases = await load<Array<Record<string, unknown>>>("case-metadata.ts", "caseStudies");
    result = cases.map((item) => ({
      ...item,
      id: caseId(String(item.slug)),
      prerequisiteIds: (item.prerequisiteIds as string[]).map(topicId),
      toolIds: (item.toolIds as string[]).map(toolId),
      bodyAsset: `mdx/cases/${String(item.slug)}.mdx`,
    }));
    break;
  }
  default:
    throw new Error("Usage: tsx scripts/migrate-easyinfra.ts <topics|concepts|tools|cases> [source-root]");
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

