const editorData = JSON.parse(
  document.getElementById("comment-editor-data").textContent || "{}",
);
const initialText = typeof editorData.initialText === "string"
  ? editorData.initialText
  : "";

const editorContainer = document.getElementById("editor-container");
const fallbackEditor = document.getElementById("fallback-editor");
const status = document.getElementById("status");
const saveButton = document.getElementById("save-button");
const cancelButton = document.getElementById("cancel-button");

let editor = null;
let submitted = false;

function setStatus(text) {
  status.textContent = text;
}

function showFallbackEditor(reason) {
  editorContainer.style.display = "none";
  fallbackEditor.style.display = "block";
  fallbackEditor.value = editor ? editor.getValue() : initialText;
  fallbackEditor.focus();
  setStatus(reason ? `Plain text mode • ${reason}` : "Plain text mode");
}

function currentText() {
  return editor ? editor.getValue() : fallbackEditor.value;
}

function sendAndClose(message) {
  if (submitted) return;
  submitted = true;

  if (!window.glimpse || typeof window.glimpse.send !== "function") {
    submitted = false;
    setStatus("Glimpse bridge unavailable");
    return;
  }

  window.glimpse.send(message);
  window.glimpse.close();
}

function submit() {
  sendAndClose({ type: "submit", text: currentText() });
}

function cancel() {
  sendAndClose({ type: "cancel" });
}

saveButton.addEventListener("click", submit);
cancelButton.addEventListener("click", cancel);

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    submit();
  }
});

fallbackEditor.value = initialText;

if (typeof window.require !== "function") {
  showFallbackEditor("Monaco could not be loaded");
} else {
  window.require.config({
    paths: {
      vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs",
    },
  });

  window.require(
    ["vs/editor/editor.main"],
    () => {
      window.monaco.editor.defineTheme("pi-comment-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: {
          "editor.background": "#0d1117",
          "editorLineNumber.foreground": "#484f58",
          "editorLineNumber.activeForeground": "#8b949e",
          "editorCursor.foreground": "#58a6ff",
          "editor.selectionBackground": "#1f6feb66",
        },
      });

      editor = window.monaco.editor.create(editorContainer, {
        value: initialText,
        language: "markdown",
        theme: "pi-comment-dark",
        automaticLayout: true,
        ariaLabel: "Comment editor",
        fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 21,
        lineNumbersMinChars: 3,
        minimap: { enabled: false },
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "line",
        roundedSelection: false,
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: "on",
      });

      editor.addCommand(
        window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter,
        submit,
      );
      editor.focus();
      setStatus("Markdown • Wrap on");
    },
    () => showFallbackEditor("Monaco could not be loaded"),
  );
}
