import assert from "node:assert/strict";
import test from "node:test";
import {
  formatQuotedEditorText,
  parseCommentWindowMessage,
  removeOneTrailingNewline,
} from "../src/comment.ts";
import { buildCommentEditorHtml } from "../src/ui.ts";

test("formats every assistant line as a Markdown quote", () => {
  assert.equal(formatQuotedEditorText("one\n\nthree"), "> one\n> \n> three");
});

test("removes at most one trailing newline", () => {
  assert.equal(removeOneTrailingNewline("comment\n\n"), "comment\n");
  assert.equal(removeOneTrailingNewline("comment"), "comment");
});

test("accepts only valid Glimpse editor messages", () => {
  assert.deepEqual(parseCommentWindowMessage({ type: "submit", text: "ok" }), {
    type: "submit",
    text: "ok",
  });
  assert.deepEqual(parseCommentWindowMessage({ type: "cancel" }), {
    type: "cancel",
  });
  assert.equal(parseCommentWindowMessage({ type: "submit", text: 1 }), undefined);
  assert.equal(parseCommentWindowMessage({ type: "other" }), undefined);
});

test("embeds initial text without allowing a script-tag breakout", () => {
  const hostileText = "before </script><script>globalThis.pwned = true</script> after";
  const html = buildCommentEditorHtml(hostileText);

  assert.ok(!html.includes(hostileText));
  assert.ok(html.includes("\\u003c/script\\u003e"));
  assert.ok(!html.includes("__INLINE_DATA__"));
  assert.ok(!html.includes("__INLINE_JS__"));
});
