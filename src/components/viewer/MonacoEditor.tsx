import Editor from "@monaco-editor/react";
import { detectLanguage } from "@/lib/languages";
import { useMonacoEditor } from "@/hooks/useMonacoEditor";

interface MonacoEditorProps {
  tabId: string;
  content: string;
  filePath: string;
}

export function MonacoEditor({ tabId, content, filePath }: MonacoEditorProps) {
  const { mode, handleMount, handleBeforeMount, handleChange } =
    useMonacoEditor({
      tabId,
      content,
      filePath,
    });

  const language = detectLanguage(filePath);

  return (
    <Editor
      defaultValue={content}
      language={language}
      theme={mode === "dark" ? "edity-dark" : "edity-light"}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={handleChange}
      options={{
        minimap: { enabled: true },
        fontSize: 13,
        lineNumbers: "on",
        wordWrap: "on",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderWhitespace: "selection",
        tabSize: 2,
        suggestOnTriggerCharacters: true,
        parameterHints: { enabled: true, cycle: true },
        quickSuggestions: { other: true, comments: false, strings: true },
        formatOnPaste: true,
        formatOnType: true,
        autoClosingBrackets: "languageDefined",
        autoClosingQuotes: "languageDefined",
        autoSurround: "languageDefined",
        bracketPairColorization: { enabled: true },
        matchBrackets: "always",
        linkedEditing: true,
        codeLens: true,
        inlayHints: { enabled: "on" as const },
        hover: { enabled: true, delay: 300 },
        suggest: {
          showMethods: true,
          showFunctions: true,
          showConstructors: true,
          showFields: true,
          showVariables: true,
          showClasses: true,
          showInterfaces: true,
          showModules: true,
          showProperties: true,
          showKeywords: true,
          showSnippets: true,
          preview: true,
          filterGraceful: true,
          localityBonus: true,
        },
        stickyScroll: { enabled: true },
        renderLineHighlight: "all",
        cursorSmoothCaretAnimation: "on",
        smoothScrolling: true,
        mouseWheelZoom: true,
        folding: true,
        foldingStrategy: "auto",
        showFoldingControls: "mouseover",
        guides: { bracketPairs: true, indentation: true },
      }}
    />
  );
}
