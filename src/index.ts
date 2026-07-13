import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openGlimpseWindow,
  type GlimpseRelayWindow,
} from "@bobrossthepainter/glimpse-relay-client";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import {
  formatQuotedEditorText,
  getLastAssistantText,
  parseCommentWindowMessage,
  removeOneTrailingNewline,
} from "./comment.js";
import { buildCommentEditorHtml } from "./ui.js";

type WaitingEditorResult = "escape" | "window-settled";

function isProbablyContainerized(): boolean {
  if (fs.existsSync("/.dockerenv") || fs.existsSync("/run/.containerenv")) {
    return true;
  }

  try {
    return /docker|containerd|kubepods|podman/i.test(
      fs.readFileSync("/proc/1/cgroup", "utf8"),
    );
  } catch {
    return false;
  }
}

function editWithExternalEditor(initialText: string): string {
  const editorCommand = process.env.VISUAL || process.env.EDITOR;
  if (!editorCommand) {
    throw new Error(
      "No editor configured. Set $VISUAL or $EDITOR environment variable.",
    );
  }

  const temporaryFile = path.join(
    os.tmpdir(),
    `pi-comment-${process.pid}-${Date.now()}.md`,
  );

  try {
    fs.writeFileSync(temporaryFile, initialText, "utf8");
    const [editor, ...editorArguments] = editorCommand.split(" ");
    const result = spawnSync(editor, [...editorArguments, temporaryFile], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      throw new Error(
        `Editor exited with status ${result.status ?? "unknown"}`,
      );
    }
    return removeOneTrailingNewline(
      fs.readFileSync(temporaryFile, "utf8"),
    );
  } finally {
    try {
      fs.unlinkSync(temporaryFile);
    } catch {
      // Ignore cleanup errors.
    }
  }
}

async function editWithPiUi(
  ctx: ExtensionContext,
  initialText: string,
): Promise<string | undefined> {
  const editedText = await ctx.ui.editor("Edit comment", initialText);
  return editedText == null
    ? undefined
    : removeOneTrailingNewline(editedText);
}

function closeWindow(window: GlimpseRelayWindow): void {
  try {
    window.close();
  } catch {
    // The window may already have been closed by its web UI.
  }
}

export default function commentExtension(pi: ExtensionAPI): void {
  let activeWindow: GlimpseRelayWindow | null = null;
  let dismissWaitingUi: (() => void) | null = null;

  const closeActiveWindow = (): void => {
    if (activeWindow == null) return;
    const window = activeWindow;
    activeWindow = null;
    closeWindow(window);
  };

  const showWaitingUi = (
    ctx: ExtensionCommandContext,
  ): {
    promise: Promise<WaitingEditorResult>;
    dismiss: () => void;
  } => {
    let settled = false;
    let doneCallback: ((result: WaitingEditorResult) => void) | null = null;
    let pendingResult: WaitingEditorResult | null = null;

    const finish = (result: WaitingEditorResult): void => {
      if (settled) return;
      settled = true;
      if (dismissWaitingUi === dismiss) dismissWaitingUi = null;
      if (doneCallback == null) pendingResult = result;
      else doneCallback(result);
    };

    const promise = ctx.ui.custom<WaitingEditorResult>(
      (_tui, theme, _keybindings, done) => {
        doneCallback = done;
        if (pendingResult != null) {
          const result = pendingResult;
          pendingResult = null;
          queueMicrotask(() => done(result));
        }

        return {
          render(width: number): string[] {
            const lines = [
              theme.fg("accent", theme.bold("Waiting for comment")),
              "The Glimpse editor window is open.",
              theme.fg("dim", "Press Escape here to cancel and close it."),
            ];
            return lines.map((line) =>
              truncateToWidth(line, Math.max(1, width), "..."),
            );
          },
          handleInput(data: string): void {
            if (matchesKey(data, Key.escape)) finish("escape");
          },
          invalidate(): void {},
        };
      },
    );

    const dismiss = (): void => finish("window-settled");
    dismissWaitingUi = dismiss;
    return { promise, dismiss };
  };

  const editWithGlimpse = async (
    ctx: ExtensionCommandContext,
    initialText: string,
  ): Promise<string | undefined> => {
    if (activeWindow != null) {
      throw new Error("A Glimpse comment editor is already open.");
    }

    const html = buildCommentEditorHtml(initialText);
    const window = await openGlimpseWindow(html, {
      width: 1120,
      height: 760,
      title: "Pi comment",
    });
    activeWindow = window;

    const windowResult = new Promise<string | undefined>((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        window.removeListener("message", onMessage);
        window.removeListener("closed", onClosed);
        window.removeListener("error", onError);
      };
      const settle = (value: string | undefined): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const onMessage = (data: unknown): void => {
        const message = parseCommentWindowMessage(data);
        if (message?.type === "submit") {
          settle(removeOneTrailingNewline(message.text));
        } else if (message?.type === "cancel") {
          settle(undefined);
        }
      };
      const onClosed = (): void => settle(undefined);
      const onError = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      window.on("message", onMessage);
      window.on("closed", onClosed);
      window.on("error", onError);
    });

    const waitingUi = showWaitingUi(ctx);
    ctx.ui.notify("Opened Glimpse comment editor.", "info");

    try {
      const result = await Promise.race([
        windowResult.then((text) => ({ type: "window" as const, text })),
        waitingUi.promise.then((reason) => ({ type: "ui" as const, reason })),
      ]);

      if (result.type === "ui" && result.reason === "escape") {
        closeWindow(window);
        await windowResult.catch(() => undefined);
        return undefined;
      }

      if (result.type === "ui") {
        return await windowResult;
      }

      return result.text;
    } finally {
      waitingUi.dismiss();
      await waitingUi.promise;
      closeWindow(window);
      if (activeWindow === window) activeWindow = null;
    }
  };

  const editCommentText = async (
    ctx: ExtensionCommandContext,
    initialText: string,
  ): Promise<string | undefined> => {
    const mode = process.env.PI_COMMENT_EDITOR?.trim().toLowerCase();
    const forceGlimpse = mode === "glimpse";
    const forceExternal = mode === "external";
    const forcePiUi = mode === "pi-ui" || mode === "inline";

    if (forceGlimpse) {
      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          "Glimpse comment editor requires Pi TUI mode; falling back to Pi UI.",
          "warning",
        );
        return editWithPiUi(ctx, initialText);
      }

      try {
        return await editWithGlimpse(ctx, initialText);
      } catch (error) {
        ctx.ui.notify(
          `Glimpse editor failed; falling back to Pi UI: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "warning",
        );
        return editWithPiUi(ctx, initialText);
      }
    }

    const hasExternalEditor = Boolean(process.env.VISUAL || process.env.EDITOR);
    const shouldUseExternal =
      !forcePiUi &&
      hasExternalEditor &&
      (forceExternal || !isProbablyContainerized());

    if (!shouldUseExternal) return editWithPiUi(ctx, initialText);

    try {
      return editWithExternalEditor(initialText);
    } catch (error) {
      ctx.ui.notify(
        `External editor failed; falling back to Pi UI: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "warning",
      );
      return editWithPiUi(ctx, initialText);
    }
  };

  pi.registerCommand("comment", {
    description:
      "Edit the last assistant message via Glimpse, $EDITOR, or Pi UI and load the result into the editor",
    handler: async (_arguments, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("comment requires interactive mode", "error");
        return;
      }

      const lastAssistantText = getLastAssistantText(
        ctx.sessionManager.getBranch(),
      );
      if (!lastAssistantText) {
        ctx.ui.notify(
          "No completed assistant message found on the current branch",
          "error",
        );
        return;
      }

      try {
        const editedText = await editCommentText(
          ctx,
          formatQuotedEditorText(lastAssistantText),
        );
        if (editedText === undefined) {
          ctx.ui.notify("Comment edit cancelled", "info");
          return;
        }

        ctx.ui.setEditorText(editedText);
        ctx.ui.notify(
          "Loaded edited quoted assistant text into the editor",
          "info",
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });

  pi.on("session_shutdown", async () => {
    dismissWaitingUi?.();
    closeActiveWindow();
  });
}
