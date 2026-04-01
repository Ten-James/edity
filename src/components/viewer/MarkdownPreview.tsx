import {
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getHighlighter, detectLang, ensureShikiTheme } from "@/lib/shiki";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MarkdownPreviewProps {
  content: string;
  filePath: string;
}

function ShikiCodeBlock({
  language,
  children,
}: {
  language: string;
  children: string;
}) {
  const { activeTheme } = useTheme();
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      const highlighter = await getHighlighter();
      if (cancelled) return;

      const shikiTheme = activeTheme.shikiTheme;
      await ensureShikiTheme(shikiTheme);

      const loadedLangs = highlighter.getLoadedLanguages();
      if (!loadedLangs.includes(language as never) && language !== "text") {
        try {
          await highlighter.loadLanguage(language as never);
        } catch {
          // fallback to text
        }
      }
      if (cancelled) return;

      const loadedAfter = highlighter.getLoadedLanguages();
      const actualLang = loadedAfter.includes(language as never)
        ? language
        : "text";

      const result = highlighter.codeToHtml(children, {
        lang: actualLang,
        theme: shikiTheme,
      });
      if (!cancelled) setHtml(result);
    }

    highlight();
    return () => {
      cancelled = true;
    };
  }, [children, language, activeTheme]);

  if (!html) {
    return (
      <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs">
        <code>{children}</code>
      </pre>
    );
  }

  return (
    <div
      className="rounded-md overflow-x-auto text-xs [&_pre]:p-4 [&_pre]:m-0 [&_pre]:rounded-md"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MarkdownPreview({ content, filePath }: MarkdownPreviewProps) {
  const resolveImageSrc = (src: string | undefined) => {
    if (!src) return src;
    if (
      src.startsWith("http://") ||
      src.startsWith("https://") ||
      src.startsWith("data:")
    ) {
      return src;
    }
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    return `edity-file://${encodeURI(dir + "/" + src)}`;
  };

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-4xl mx-auto px-8 py-6">
        <div
          className={[
            "text-sm text-foreground leading-relaxed",
            // Headings
            "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:pb-2 [&_h1]:border-b [&_h1]:border-border",
            "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:pb-1.5 [&_h2]:border-b [&_h2]:border-border",
            "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4",
            "[&_h4]:text-base [&_h4]:font-semibold [&_h4]:mb-2 [&_h4]:mt-3",
            "[&_h5]:text-sm [&_h5]:font-semibold [&_h5]:mb-1 [&_h5]:mt-3",
            "[&_h6]:text-sm [&_h6]:font-medium [&_h6]:mb-1 [&_h6]:mt-3 [&_h6]:text-muted-foreground",
            // Paragraphs
            "[&_p]:mb-3 [&_p]:leading-relaxed",
            // Lists
            "[&_ul]:mb-3 [&_ul]:pl-6 [&_ul]:list-disc",
            "[&_ol]:mb-3 [&_ol]:pl-6 [&_ol]:list-decimal",
            "[&_li]:mb-1 [&_li]:leading-relaxed",
            "[&_li>ul]:mt-1 [&_li>ol]:mt-1",
            // Inline code
            "[&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:text-xs [&_:not(pre)>code]:font-mono",
            // Code blocks
            "[&_pre]:mb-3",
            // Blockquote
            "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:py-1 [&_blockquote]:mb-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
            "[&_blockquote_p]:mb-1",
            // Horizontal rule
            "[&_hr]:border-border [&_hr]:my-6",
            // Links
            "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80",
            // Tables
            "[&_table]:w-full [&_table]:mb-3 [&_table]:border-collapse",
            "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold",
            "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-xs",
            // Images
            "[&_img]:max-w-full [&_img]:rounded-md [&_img]:my-3",
            // Strong / em
            "[&_strong]:font-semibold",
            "[&_em]:italic",
            // Strikethrough
            "[&_del]:line-through [&_del]:text-muted-foreground",
            // Task lists
            "[&_.task-list-item]:list-none [&_.task-list-item]:ml-[-1.5rem]",
            "[&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:align-middle",
          ].join(" ")}
        >
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props: ComponentPropsWithoutRef<"code">) {
                const { children, className, ...rest } = props;
                const match = /language-(\w+)/.exec(className ?? "");
                const isBlock =
                  typeof children === "string" && children.includes("\n");

                if (match || isBlock) {
                  const lang = match ? detectLang("file." + match[1]) : "text";
                  return (
                    <ShikiCodeBlock language={lang}>
                      {String(children).replace(/\n$/, "")}
                    </ShikiCodeBlock>
                  );
                }

                return (
                  <code className={className} {...rest}>
                    {children}
                  </code>
                );
              },
              img(props: ComponentPropsWithoutRef<"img">) {
                const { src, alt, ...rest } = props;
                return (
                  <img src={resolveImageSrc(src)} alt={alt ?? ""} {...rest} />
                );
              },
              a(props: ComponentPropsWithoutRef<"a">) {
                const { href, children, ...rest } = props;
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...rest}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {content}
          </Markdown>
        </div>
      </div>
    </ScrollArea>
  );
}
