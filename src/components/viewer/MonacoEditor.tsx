import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount, type BeforeMount, type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { toast } from "sonner";
import { invoke } from "@/lib/ipc";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAppContext } from "@/contexts/AppContext";
import { detectLanguage } from "@/lib/languages";
import type { MonacoThemeColors } from "@shared/types/settings";

// Cache loaded project types to avoid re-fetching per file
const loadedProjects = new Set<string>();

function monacoThemeColors(c: MonacoThemeColors) {
  return {
    "editor.background": c.bg,
    "editor.foreground": c.fg,
    "editorCursor.foreground": c.primary,
    "editor.lineHighlightBackground": c.muted,
    "editor.selectionBackground": c.accent + "80",
    "editorLineNumber.foreground": c.mutedFg,
    "editorLineNumber.activeForeground": c.fg,
    "editorWidget.background": c.card,
    "editorWidget.border": c.muted,
    "editorSuggestWidget.background": c.card,
    "editorSuggestWidget.border": c.muted,
    "editorSuggestWidget.selectedBackground": c.accent,
    "editorHoverWidget.background": c.card,
    "editorHoverWidget.border": c.muted,
    "editorGroupHeader.tabsBackground": c.bg,
    "editorGutter.background": c.bg,
    "scrollbarSlider.background": c.mutedFg + "30",
    "scrollbarSlider.hoverBackground": c.mutedFg + "50",
    "scrollbarSlider.activeBackground": c.mutedFg + "70",
    "minimap.background": c.bg,
    "input.background": c.muted,
    "input.border": c.muted,
    "dropdown.background": c.card,
    "dropdown.border": c.muted,
    "list.hoverBackground": c.accent,
    "list.activeSelectionBackground": c.primary + "40",
    "list.focusBackground": c.accent,
  };
}

interface ProjectTypes {
  compilerOptions: Record<string, unknown> | null;
  libs: Array<{ content: string; filePath: string }>;
}

function applyProjectTypes(monacoInstance: Monaco, projectTypes: ProjectTypes) {
  const ts = monacoInstance.languages.typescript;

  // Set compiler options
  const compilerOptions: Record<string, unknown> = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    allowJs: true,
    allowSyntheticDefaultImports: true,
    strict: false,
    allowNonTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    isolatedModules: true,
    ...(projectTypes.compilerOptions ?? {}),
  };

  const defaults = [ts.typescriptDefaults, ts.javascriptDefaults];
  for (const d of defaults) {
    d.setCompilerOptions(
      compilerOptions as Parameters<typeof ts.typescriptDefaults.setCompilerOptions>[0],
    );
    d.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    });
    d.setEagerModelSync(true);
    for (const lib of projectTypes.libs) {
      d.addExtraLib(lib.content, lib.filePath);
    }
  }
}

interface MonacoEditorProps {
  tabId: string;
  content: string;
  filePath: string;
}

export function MonacoEditor({ tabId, content, filePath }: MonacoEditorProps) {
  const { mode, activeTheme } = useTheme();
  const { setTabDirty, activeProject } = useAppContext();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const savedContentRef = useRef(content);
  const language = detectLanguage(filePath);

  // Update saved content baseline when external content changes (file watcher reload)
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const currentValue = ed.getValue();
    // Only update if editor matches the old saved content (not dirty)
    if (currentValue === savedContentRef.current) {
      savedContentRef.current = content;
      if (content !== currentValue) {
        ed.setValue(content);
      }
      setTabDirty(tabId, false);
    } else {
      // Editor is dirty — don't overwrite, just update baseline for next save
      savedContentRef.current = content;
    }
  }, [content, tabId, setTabDirty]);

  const handleSave = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    const value = ed.getValue();
    try {
      const result = await invoke<{ ok: boolean; error?: string }>(
        "write_file",
        { path: filePath, content: value },
      );
      if (result.ok) {
        savedContentRef.current = value;
        setTabDirty(tabId, false);
        toast.success("File saved");
      } else {
        toast.error(result.error ?? "Failed to save file");
      }
    } catch {
      toast.error("Failed to save file");
    }
  }, [filePath, tabId, setTabDirty]);

  const handleMount: OnMount = useCallback(
    (editor, monacoInstance) => {
      editorRef.current = editor;
      monacoRef.current = monacoInstance;
      savedContentRef.current = content;

      // Enable lightbulb (programmatic to avoid enum type mismatch)
      editor.updateOptions({ lightbulb: { enabled: "onCode" } } as Record<string, unknown>);

      // Cmd+S / Ctrl+S to save
      editor.addCommand(
        // eslint-disable-next-line no-bitwise
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
        () => handleSave(),
      );

      // Load project type definitions (once per project)
      const projectPath = activeProject?.path;
      if (projectPath && !loadedProjects.has(projectPath)) {
        loadedProjects.add(projectPath);
        invoke<ProjectTypes>("get_project_types", { projectPath }).then(
          (types) => applyProjectTypes(monacoInstance, types),
        ).catch(() => {});
      }
    },
    [content, handleSave, activeProject],
  );

  // Re-register Monaco theme whenever the active theme changes
  useEffect(() => {
    const m = monacoRef.current;
    if (!m) return;
    const themeName = mode === "dark" ? "edity-dark" : "edity-light";
    m.editor.defineTheme(themeName, {
      base: mode === "dark" ? "vs-dark" : "vs",
      inherit: true,
      rules: [],
      colors: monacoThemeColors(activeTheme.monaco),
    });
    m.editor.setTheme(themeName);
  }, [activeTheme, mode]);

  const handleBeforeMount: BeforeMount = useCallback((monacoInstance) => {
    const themeName = mode === "dark" ? "edity-dark" : "edity-light";
    monacoInstance.editor.defineTheme(themeName, {
      base: mode === "dark" ? "vs-dark" : "vs",
      inherit: true,
      rules: [],
      colors: monacoThemeColors(activeTheme.monaco),
    });
  }, [activeTheme, mode]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      setTabDirty(tabId, value !== savedContentRef.current);
    },
    [tabId, setTabDirty],
  );

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
        // lightbulb enabled programmatically in onMount to avoid enum type mismatch
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
