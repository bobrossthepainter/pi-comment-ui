import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = join(sourceDirectory, "..", "web");

function escapeForInlineScript(value: string): string {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildCommentEditorHtml(initialText: string): string {
  const templateHtml = readFileSync(join(webDirectory, "index.html"), "utf8");
  const appJavaScript = readFileSync(join(webDirectory, "app.js"), "utf8");
  const payload = escapeForInlineScript(JSON.stringify({ initialText }));

  return templateHtml
    .replace("__INLINE_DATA__", payload)
    .replace("__INLINE_JS__", appJavaScript);
}
