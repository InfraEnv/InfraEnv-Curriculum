/** SPDX-License-Identifier: Apache-2.0 */
import assert from "node:assert/strict";
import test from "node:test";
import { compilePortableLessonDocument } from "../src/portable-lesson.js";

const options = { lessonId: "lesson:test" as const, locale: "zh-CN" as const, sourceAsset: "mdx/lessons/test.zh-CN.mdx" };

test("compiles restricted MDX into a data-only portable document", () => {
  const document = compilePortableLessonDocument('# 标题\n\n<Callout title="边界">\n只包含 **安全文本**。\n</Callout>', options);
  assert.equal(document.schemaVersion, "1.0.0");
  assert.equal(document.blocks.at(0)?.kind, "heading");
  const component = document.blocks.at(1);
  assert.equal(component?.kind, "component");
  if (component?.kind === "component") {
    assert.equal(component.component, "Callout");
    assert.deepEqual(component.props, { title: "边界" });
  }
  assert.equal(JSON.stringify(document).includes("function"), false);
});

test("rejects unsafe links and unsupported raw HTML", () => {
  assert.throws(() => compilePortableLessonDocument("[bad](javascript:alert(1))", options), /HTTPS or a local path/u);
  assert.throws(() => compilePortableLessonDocument("<script>alert(1)</script>", options), /Unsupported Markdown block|not allowed|allowlist/u);
});
