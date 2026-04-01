import { useEffect, useRef } from "react";
import type { OnMount, BeforeMount, Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { toast } from "sonner";
import { invoke } from "@/lib/ipc";
import { dispatch } from "@/stores/eventBus";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import type { MonacoThemeColors } from "@shared/types/settings";

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

interface UseMonacoEditorOptions {
  tabId: string;
  content: string;
  filePath: string;
}

export function useMonacoEditor({ tabId, content, filePath }: UseMonacoEditorOptions) {
  const mode = useSettingsStore((s) => s.mode);
  const activeTheme = useSettingsStore((s) => s.activeTheme);
  const activeProject = useProjectStore((s) => s.activeProject);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const savedContentRef = useRef(content);

  // Sync content from file watcher
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const currentValue = ed.getValue();
    if (currentValue === savedContentRef.current) {
      savedContentRef.current = content;
      if (content !== currentValue) ed.setValue(content);
      dispatch({ type: "tab-set-dirty", tabId, dirty: false });
    } else {
      savedContentRef.current = content;
    }
  }, [content, tabId]);

  async function handleSave() {
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
        dispatch({ type: "tab-set-dirty", tabId, dirty: false });
        toast.success("File saved");
      } else {
        toast.error(result.error ?? "Failed to save file");
      }
    } catch {
      toast.error("Failed to save file");
    }
  }

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    savedContentRef.current = content;

    editor.updateOptions({ lightbulb: { enabled: "onCode" } } as Record<string, unknown>);

    editor.addCommand(
      // eslint-disable-next-line no-bitwise
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
      () => handleSave(),
    );

    const projectPath = activeProject?.path;
    if (projectPath && !loadedProjects.has(projectPath)) {
      loadedProjects.add(projectPath);
      invoke<ProjectTypes>("get_project_types", { projectPath })
        .then((types) => applyProjectTypes(monacoInstance, types))
        .catch(() => {});
    }
  };

  // Re-register theme
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

  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    const themeName = mode === "dark" ? "edity-dark" : "edity-light";
    monacoInstance.editor.defineTheme(themeName, {
      base: mode === "dark" ? "vs-dark" : "vs",
      inherit: true,
      rules: [],
      colors: monacoThemeColors(activeTheme.monaco),
    });
  };

  function handleChange(value: string | undefined) {
    dispatch({ type: "tab-set-dirty", tabId, dirty: value !== savedContentRef.current });
  }

  return {
    mode,
    handleMount,
    handleBeforeMount,
    handleChange,
  };
}
