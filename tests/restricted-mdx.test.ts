/** SPDX-License-Identifier: Apache-2.0 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRestrictedMdx } from "../src/restricted-mdx.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mdxRoot = join(repositoryRoot, "content", "mdx");

const filesBelow = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });

test("accepts every checked-in MDX asset", () => {
  for (const path of filesBelow(mdxRoot).filter((item) => item.endsWith(".mdx"))) {
    const result = validateRestrictedMdx(readFileSync(path, "utf8"), path);
    assert.deepEqual(result.issues, [], path);
  }
});

test("rejects executable MDX and unknown components", () => {
  assert.equal(validateRestrictedMdx('import x from "./x.js"\n\n# Unsafe').valid, false);
  assert.equal(validateRestrictedMdx("# Unsafe\n\n{globalThis.process}").valid, false);
  assert.equal(validateRestrictedMdx("<Danger>unsafe</Danger>").valid, false);
  assert.equal(validateRestrictedMdx("<Callout value={globalThis.process}>unsafe</Callout>").valid, false);
});

test("does not mistake fenced code for executable MDX", () => {
  assert.equal(validateRestrictedMdx("```c\nint main(void) { return 0; }\n```").valid, true);
});

