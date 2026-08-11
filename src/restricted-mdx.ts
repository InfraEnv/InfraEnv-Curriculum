/** SPDX-License-Identifier: Apache-2.0 */
import { createProcessor } from "@mdx-js/mdx";
import { visit } from "unist-util-visit";
import type { ValidationIssue, ValidationResult } from "./types.js";

export const RESTRICTED_MDX_COMPONENTS = Object.freeze([
  "Callout",
  "Command",
  "LabStep",
  "Observation",
  "FaultAction",
  "Quiz",
] as const);

const allowed = new Set<string>(RESTRICTED_MDX_COMPONENTS);
const expressionTypes = new Set(["mdxTextExpression", "mdxFlowExpression"]);
const jsxTypes = new Set(["mdxJsxFlowElement", "mdxJsxTextElement"]);

interface MdxCandidate {
  type: string;
  name?: string | null;
  attributes?: Array<{ name?: string; value?: unknown }>;
  position?: { start?: { line?: number; column?: number } };
}

const issuePath = (assetPath: string, node: MdxCandidate): string => {
  const line = node.position?.start?.line;
  const column = node.position?.start?.column;
  return line === undefined ? assetPath : `${assetPath}:${line}:${column ?? 1}`;
};

export function validateRestrictedMdx(source: string, assetPath = "<mdx>"): ValidationResult {
  const issues: ValidationIssue[] = [];
  let tree: ReturnType<ReturnType<typeof createProcessor>["parse"]>;

  try {
    tree = createProcessor({ format: "mdx" }).parse(source);
  } catch (error) {
    return {
      valid: false,
      issues: [{ path: assetPath, message: `MDX parse error: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }

  visit(tree, (node) => {
    const candidate = node as MdxCandidate;
    if (candidate.type === "mdxjsEsm") {
      issues.push({ path: issuePath(assetPath, candidate), message: "import/export is forbidden in restricted MDX" });
      return;
    }
    if (expressionTypes.has(candidate.type)) {
      issues.push({ path: issuePath(assetPath, candidate), message: "JavaScript expressions are forbidden in restricted MDX" });
      return;
    }
    if (!jsxTypes.has(candidate.type)) return;

    if (candidate.name === undefined || candidate.name === null || !allowed.has(candidate.name)) {
      issues.push({
        path: issuePath(assetPath, candidate),
        message: `MDX component ${candidate.name ?? "fragment"} is not in the restricted component allowlist`,
      });
    }

    for (const attribute of candidate.attributes ?? []) {
      if (typeof attribute.value === "object" && attribute.value !== null) {
        issues.push({
          path: issuePath(assetPath, candidate),
          message: `Expression-valued attribute ${attribute.name ?? "<spread>"} is forbidden`,
        });
      }
    }
  });

  return { valid: issues.length === 0, issues };
}

