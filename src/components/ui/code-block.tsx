import { cn } from "@/lib/utils";

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
}

export function CodeBlock({ children, className }: CodeBlockProps) {
  return (
    <pre
      className={cn(
        "max-h-60 overflow-auto whitespace-pre-wrap break-all bg-muted p-2 font-mono text-xs",
        className,
      )}
    >
      {children}
    </pre>
  );
}
