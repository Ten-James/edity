import { useState } from "react";
import type { PendingQuestion } from "@/types/claude";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IconQuestionMark } from "@tabler/icons-react";

interface ClaudeQuestionPromptProps {
  pendingQuestion: PendingQuestion;
  onAnswer: (answers: Record<string, string>) => void;
}

export function ClaudeQuestionPrompt({ pendingQuestion, onAnswer }: ClaudeQuestionPromptProps) {
  const [freeText, setFreeText] = useState("");
  const question = pendingQuestion.questions[0];

  if (!question) return null;

  const handleSubmit = () => {
    const trimmed = freeText.trim();
    if (!trimmed) return;
    onAnswer({ [question.id]: trimmed });
    setFreeText("");
  };

  const handleOptionClick = (label: string) => {
    onAnswer({ [question.id]: label });
  };

  return (
    <div className="border-t border-border bg-primary/5 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <IconQuestionMark size={16} className="mt-0.5 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          {question.header && (
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              {question.header}
            </p>
          )}
          <p className="text-sm">{question.question}</p>
        </div>
      </div>

      {question.options && question.options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((opt) => (
            <Button
              key={opt.label}
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleOptionClick(opt.label)}
              title={opt.description}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <Textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Type your answer..."
            rows={1}
            className="resize-none text-sm flex-1"
            autoFocus
          />
          <Button size="sm" onClick={handleSubmit} disabled={!freeText.trim()}>
            Send
          </Button>
        </div>
      )}
    </div>
  );
}
