import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export type CommentWindowMessage =
  | { type: "submit"; text: string }
  | { type: "cancel" };

export function getLastAssistantText(
  branch: SessionEntry[],
): string | undefined {
  for (let i = branch.length - 1; i >= 0; i -= 1) {
    const entry = branch[i];
    if (entry.type !== "message") continue;

    const message = entry.message;
    if (message.role !== "assistant") continue;
    if (message.stopReason !== "stop") return undefined;

    const text = message.content
      .filter(
        (part): part is { type: "text"; text: string } =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join("\n")
      .trim();
    return text || undefined;
  }

  return undefined;
}

export function formatQuotedEditorText(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export function removeOneTrailingNewline(text: string): string {
  return text.replace(/\n$/, "");
}

export function parseCommentWindowMessage(
  value: unknown,
): CommentWindowMessage | undefined {
  if (value == null || typeof value !== "object") return undefined;

  const message = value as { type?: unknown; text?: unknown };
  if (message.type === "cancel") return { type: "cancel" };
  if (message.type === "submit" && typeof message.text === "string") {
    return { type: "submit", text: message.text };
  }

  return undefined;
}
