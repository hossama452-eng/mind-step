"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { SectionHeader } from "../SectionHeader";
import { EmptyState } from "../EmptyState";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "../LoadingButton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDialogStore } from "@/stores/dialog-store";
import { useUIStore } from "@/stores/ui-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import { MEDICAL_DISCLAIMER, FEATURES } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Bot, Send, ShieldCheck, Sparkles, Trash2, RotateCw, AlertCircle, Info } from "lucide-react";
import type { Locale } from "@/i18n/locale";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: Array<{
    type: string;
    label: string;
    requiresConfirmation: boolean;
    section?: string;
    plannedMinutes?: number;
    taskId?: string;
  }>;
  source?: "llm" | "deterministic";
}

const AI_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "x-mindstep-user-id": "demo-user",
  "x-mindstep-auto-create-user": "true",
};

const EXAMPLE_PROMPTS = [
  "What should I do next?",
  "Help me start.",
  "Plan my day.",
  "I'm overwhelmed.",
  "Break this task down.",
  "What can I finish in 15 minutes?",
];

export function AISection() {
  const t = useTranslations();
  const tAI = useTranslations("ai");
  const locale = useLocale() as Locale;
  const aiCoachEnabled = usePreferencesStore((s) => s.aiCoachEnabled);
  const openDialog = useDialogStore((s) => s.openDialog);
  const setActiveSection = useUIStore((s) => s.setActiveSection);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: tAI("welcome") },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch provider status (Prompt 07 §55 — honest disclosure).
  useEffect(() => {
    fetch("/api/ai/provider-status", { headers: AI_HEADERS })
      .then((res) => res.json())
      .then((data) => setProviderLabel(data.label ?? ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending || !aiCoachEnabled) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: AI_HEADERS,
        body: JSON.stringify({
          message: trimmed,
          locale,
          conversationId: conversationId ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "Coach failed to respond.");
      }
      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        actions: data.actions ?? [],
        source: data.source,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSending(false);
    }
  }, [draft, sending, aiCoachEnabled, locale, conversationId, tAI]);

  const handleAction = (action: NonNullable<ChatMessage["actions"]>[number]) => {
    if (action.requiresConfirmation) {
      // For actions requiring confirmation, navigate to the relevant section.
      if (action.type === "START_FOCUS") {
        openDialog("startFocus", action.taskId ? { initialTaskId: action.taskId } : undefined);
      } else if (action.type === "PLAN_DAY") {
        setActiveSection("planner");
      } else if (action.type === "BREAKDOWN_TASK") {
        // The user needs to select a task first.
        setActiveSection("tasks");
        toast.info("Pick a task, then use 'Break this down'.");
      } else {
        setActiveSection("tasks");
      }
    } else {
      // Harmless navigation.
      if (action.section) {
        setActiveSection(action.section as never);
      } else if (action.type === "CAPTURE_BRAIN_DUMP") {
        openDialog("quickCapture");
      } else {
        setActiveSection("tasks");
      }
    }
  };

  const clearConversation = () => {
    setMessages([{ id: "welcome", role: "assistant", content: tAI("welcome") }]);
    setConversationId(null);
    setError(null);
    toast.success("Conversation cleared.");
  };

  const deleteConversation = async () => {
    if (!conversationId) return;
    try {
      await fetch(`/api/ai/conversations/${conversationId}`, {
        method: "DELETE",
        headers: AI_HEADERS,
      });
      clearConversation();
      toast.success("Conversation deleted.");
    } catch {
      toast.error("Failed to delete conversation.");
    }
  };

  if (!aiCoachEnabled || !FEATURES.aiCoach) {
    return (
      <div className="space-y-6">
        <SectionHeader title={tAI("title")} description={tAI("subtitle")} />
        <Alert>
          <ShieldCheck className="size-4" aria-hidden />
          <AlertTitle>{t("settings.options.aiCoachEnabled")}</AlertTitle>
          <AlertDescription>{t("settings.sections.aiDescription")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title={tAI("title")} description={tAI("subtitle")} />

      {/* Medical disclaimer */}
      <Alert variant="default" className="border-info/30 bg-info/5">
        <ShieldCheck className="size-4 text-info" aria-hidden />
        <AlertTitle className="text-info">{tAI("disclaimer")}</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">{MEDICAL_DISCLAIMER}</AlertDescription>
      </Alert>

      {/* Provider disclosure (Prompt 07 §55) */}
      {providerLabel ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3" aria-hidden />
          <span>{providerLabel}</span>
        </div>
      ) : null}

      {/* Chat card */}
      <Card className="flex h-[60vh] min-h-[400px] flex-col">
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto pe-1"
            aria-live="polite"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" ? (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <Bot className="size-4" aria-hidden />
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 max-w-[80%]">
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm break-words",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {msg.content}
                    {/* Source disclosure for deterministic responses */}
                    {msg.source === "deterministic" && msg.role === "assistant" && msg.id !== "welcome" ? (
                      <span className="mt-1 block text-[10px] opacity-60">— rule-based response</span>
                    ) : null}
                  </div>
                  {/* Action cards (Prompt 07 §61) */}
                  {msg.actions && msg.actions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {msg.actions.map((action, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant={action.requiresConfirmation ? "default" : "outline"}
                          onClick={() => handleAction(action)}
                          className="text-xs"
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {sending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="size-4 animate-pulse" aria-hidden />
                <span>{tAI("placeholder")}</span>
              </div>
            ) : null}
            {error ? (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                <AlertCircle className="size-4" aria-hidden />
                <span>{error}</span>
                <Button variant="ghost" size="sm" onClick={send} className="ms-2">
                  <RotateCw className="size-3" aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>

          {/* Input */}
          <div className="flex gap-2 border-t border-border pt-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={tAI("placeholder")}
              rows={1}
              aria-label={tAI("placeholder")}
              className="flex-1 resize-none min-h-[40px] max-h-32"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button onClick={send} disabled={!draft.trim() || sending} size="icon" aria-label={tAI("send")}>
              <Send className="size-4" aria-hidden />
            </Button>
          </div>

          {/* Example prompts (Prompt 07 §15, §62) */}
          {messages.length <= 1 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setDraft(prompt)}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Conversation management */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={clearConversation}>
          <RotateCw className="size-3.5" aria-hidden />
          <span className="ms-1">Clear</span>
        </Button>
        {conversationId ? (
          <Button variant="ghost" size="sm" onClick={deleteConversation}>
            <Trash2 className="size-3.5" aria-hidden />
            <span className="ms-1">Delete</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
