/** SPDX-License-Identifier: Apache-2.0 */
import { createProcessor } from "@mdx-js/mdx";
import type {
  Locale,
  PortableInline,
  PortableLessonBlock,
  PortableLessonDocument,
} from "./types.js";
import { RESTRICTED_MDX_COMPONENTS, validateRestrictedMdx } from "./restricted-mdx.js";

type AstNode = {
  type: string;
  value?: string;
  depth?: number;
  lang?: string | null;
  meta?: string | null;
  ordered?: boolean;
  start?: number | null;
  url?: string;
  title?: string | null;
  name?: string | null;
  attributes?: Array<{ type?: string; name?: string; value?: unknown }>;
  children?: AstNode[];
};

const componentNames = new Set<string>(RESTRICTED_MDX_COMPONENTS);

function safeLink(url: string): string {
  if (url.startsWith("https://") || url.startsWith("/") || url.startsWith("#")) return url;
  throw new Error(`Portable lesson links must use HTTPS or a local path: ${url}`);
}

function inline(node: AstNode): PortableInline {
  switch (node.type) {
    case "text":
      return { kind: "text", value: node.value ?? "" };
    case "inlineCode":
      return { kind: "inline-code", value: node.value ?? "" };
    case "strong":
      return { kind: "strong", children: inlineChildren(node) };
    case "emphasis":
      return { kind: "emphasis", children: inlineChildren(node) };
    case "delete":
      return { kind: "delete", children: inlineChildren(node) };
    case "link": {
      const base = { kind: "link" as const, url: safeLink(node.url ?? ""), children: inlineChildren(node) };
      return node.title ? { ...base, title: node.title } : base;
    }
    case "break":
      return { kind: "break" };
    default:
      throw new Error(`Unsupported inline Markdown node in portable lesson: ${node.type}`);
  }
}

const inlineChildren = (node: AstNode): PortableInline[] => (node.children ?? []).map(inline);

function componentProps(node: AstNode): Record<string, string> {
  const entries = (node.attributes ?? []).map((attribute) => {
    if (attribute.type !== "mdxJsxAttribute" || !attribute.name || (typeof attribute.value !== "string" && attribute.value !== null)) {
      throw new Error(`Portable lesson component ${node.name ?? "<unknown>"} contains an unsafe attribute.`);
    }
    return [attribute.name, attribute.value ?? ""] as const;
  });
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right, "en")));
}

function block(node: AstNode): PortableLessonBlock {
  switch (node.type) {
    case "heading":
      return { kind: "heading", depth: node.depth ?? 2, children: inlineChildren(node) };
    case "paragraph":
      return { kind: "paragraph", children: inlineChildren(node) };
    case "code": {
      const base = { kind: "code" as const, value: node.value ?? "" };
      return {
        ...base,
        ...(node.lang ? { language: node.lang } : {}),
        ...(node.meta ? { meta: node.meta } : {}),
      };
    }
    case "blockquote":
      return { kind: "blockquote", children: blockChildren(node) };
    case "list": {
      const base = {
        kind: "list" as const,
        ordered: node.ordered ?? false,
        items: (node.children ?? []).map((item) => {
          if (item.type !== "listItem") throw new Error(`Portable lesson list contains ${item.type}, expected listItem.`);
          return blockChildren(item);
        }),
      };
      return node.ordered && node.start !== undefined && node.start !== null ? { ...base, start: node.start } : base;
    }
    case "thematicBreak":
      return { kind: "thematic-break" };
    case "mdxJsxFlowElement": {
      if (!node.name || !componentNames.has(node.name)) {
        throw new Error(`Portable lesson component ${node.name ?? "fragment"} is not allowed.`);
      }
      return {
        kind: "component",
        component: node.name as Extract<PortableLessonBlock, { kind: "component" }>["component"],
        props: componentProps(node),
        children: blockChildren(node),
      };
    }
    default:
      throw new Error(`Unsupported Markdown block in portable lesson: ${node.type}`);
  }
}

const blockChildren = (node: AstNode): PortableLessonBlock[] => (node.children ?? []).map(block);

export interface CompilePortableLessonOptions {
  lessonId: `lesson:${string}`;
  locale: Locale;
  sourceAsset: string;
}

export function compilePortableLessonDocument(
  source: string,
  options: CompilePortableLessonOptions,
): PortableLessonDocument {
  const restricted = validateRestrictedMdx(source, options.sourceAsset);
  if (!restricted.valid) {
    throw new Error(restricted.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  const root = createProcessor({ format: "mdx" }).parse(source) as AstNode;
  if (root.type !== "root") throw new Error(`Expected an MDX root for ${options.sourceAsset}.`);
  return {
    schemaVersion: "1.0.0",
    lessonId: options.lessonId,
    locale: options.locale,
    sourceAsset: options.sourceAsset,
    blocks: blockChildren(root),
  };
}
