import { useEffect, useRef } from "react";
import type { OnMount, BeforeMount, Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { toast } from "sonner";
import { invoke } from "@/lib/ipc";
import { dispatch, subscribe } from "@/stores/eventBus";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import type { MonacoThemeColors } from "@shared/types/settings";
import {
  DEFAULT_MONO_FONT_STACK,
  buildFontStack,
} from "@shared/lib/fonts";
import { attachLsp, type LspAttachment } from "@/hooks/useLsp";
import { detectLspLanguage } from "@/lib/lsp/lang-map";
import { consumePendingReveal } from "@/lib/editor-reveal";

const loadedProjects = new Set<string>();

function isTypeScriptLikeLang(lang: string): boolean {
  return (
    lang === "javascript" ||
    lang === "javascriptreact" ||
    lang === "typescript" ||
    lang === "typescriptreact"
  );
}

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
      compilerOptions as Parameters<
        typeof ts.typescriptDefaults.setCompilerOptions
      >[0],
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

export function useMonacoEditor({
  tabId,
  content,
  filePath,
}: UseMonacoEditorOptions) {
  const mode = useSettingsStore((s) => s.mode);
  const activeTheme = useSettingsStore((s) => s.activeTheme);
  const monoFont = useSettingsStore((s) => s.settings.monoFontFamily);
  const fontLigatures = useSettingsStore((s) => s.settings.monoFontLigatures);
  const activeProject = useProjectStore((s) => s.activeProject);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const savedContentRef = useRef(content);
  const lspAttachmentRef = useRef<LspAttachment | null>(null);

  const fontFamily = buildFontStack(monoFont, DEFAULT_MONO_FONT_STACK);

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

    editor.updateOptions({ lightbulb: { enabled: "onCode" } } as Record<
      string,
      unknown
    >);

    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
      () => handleSave(),
    );

    // Apply any pending reveal (set by fuzzy finder before dispatching the
    // open event). Wait one frame so the model is fully populated.
    const reveal = consumePendingReveal(filePath);
    if (reveal) {
      requestAnimationFrame(() => {
        editor.revealLineInCenter(reveal.line);
        editor.setPosition({ lineNumber: reveal.line, column: reveal.column });
        editor.focus();
      });
    }

    const projectPath = activeProject?.path;

    // Attach LSP client if we know a server for this file. This happens
    // asynchronously because we need to detect the server binary and run
    // the initialize handshake. If the file is a JS/TS file and vtsls is
    // available, we also disable Monaco built-in TS diagnostics to avoid
    // duplicate squigglies.
    const lspLang = detectLspLanguage(filePath);
    const model = editor.getModel();
    if (lspLang && projectPath && activeProject && model) {
      attachLsp({
        monaco: monacoInstance,
        editor,
        model,
        filePath,
        projectId: activeProject.id,
        projectPath,
      })
        .then((attachment) => {
          lspAttachmentRef.current = attachment;
          if (attachment && isTypeScriptLikeLang(lspLang)) {
            // vtsls is the authority now — disable Monaco's own TS diagnostics
            // so diagnostics don't stack. We leave the TS default config
            // (typescriptDefaults compilerOptions + extraLibs from
            // applyProjectTypes) intact for files that never get a client,
            // since disabling here is per-file is not possible in Monaco.
            const ts = monacoInstance.languages.typescript;
            ts.typescriptDefaults.setDiagnosticsOptions({
              noSemanticValidation: true,
              noSyntaxValidation: true,
              noSuggestionDiagnostics: true,
            });
            ts.javascriptDefaults.setDiagnosticsOptions({
              noSemanticValidation: true,
              noSyntaxValidation: true,
              noSuggestionDiagnostics: true,
            });
          }
        })
        .catch((err) => {
          console.error("[useMonacoEditor] attachLsp failed", err);
        });
    }

    // Keep the Monaco built-in TS service loaded for the non-LSP path
    // (projects without vtsls). If LSP takes over we won't see its
    // suggestions because they're gated by `noSuggestionDiagnostics`.
    if (projectPath && !loadedProjects.has(projectPath)) {
      loadedProjects.add(projectPath);
      invoke<ProjectTypes>("get_project_types", { projectPath })
        .then((types) => applyProjectTypes(monacoInstance, types))
        .catch(() => {});
    }
  };

  // Cleanup LSP attachment when the tab is destroyed (component unmounts).
  useEffect(() => {
    return () => {
      if (lspAttachmentRef.current) {
        lspAttachmentRef.current.dispose();
        lspAttachmentRef.current = null;
      }
    };
  }, []);

  // Subscribe to external reveal-position events (from fuzzy finder etc.)
  useEffect(() => {
    return subscribe((event) => {
      if (event.type !== "editor-reveal-position") return;
      if (event.filePath !== filePath) return;
      const ed = editorRef.current;
      if (!ed) return;
      ed.revealLineInCenter(event.line);
      ed.setPosition({ lineNumber: event.line, column: event.column });
      ed.focus();
    });
  }, [filePath]);

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

  // Sync mono font + ligatures
  useEffect(() => {
    const ed = editorRef.current;
    const m = monacoRef.current;
    if (!ed || !m) return;
    ed.updateOptions({ fontFamily, fontLigatures });
    m.editor.remeasureFonts();
  }, [fontFamily, fontLigatures]);

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
    dispatch({
      type: "tab-set-dirty",
      tabId,
      dirty: value !== savedContentRef.current,
    });
  }

  return {
    mode,
    fontFamily,
    fontLigatures,
    handleMount,
    handleBeforeMount,
    handleChange,
  };
}
