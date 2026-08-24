import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getAIProvider, isMedicalQuery, isCrisisQuery, type AIChatMessage } from "@/lib/ai/provider";
import { gatherAIContext } from "@/lib/ai/context-service";
import { AppError, ErrorCodes, toApiError } from "@/lib/errors";
import { buildApiErrorResponse } from "@/lib/error-messages";
import type { Locale } from "@/i18n/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/chat
 *
 * Context-aware AI coach chat (Prompt 07 §6, §11, §14).
 *
 * Flow:
 *   1. Authenticate the user (never trust client userId — Prompt 07 §8).
 *   2. Gather minimum-necessary context (Prompt 07 §7).
 *   3. Check medical safety (Prompt 07 §36, §38).
 *   4. Call the AI provider (LLM or deterministic fallback — Prompt 07 §3).
 *   5. Persist the conversation (Prompt 07 §12, §13).
 *   6. Return the response with action suggestions (Prompt 07 §4, §47).
 *
 * Rate limiting (Prompt 07 §39): simple per-user in-memory counter.
 * Provider failure handling (Prompt 07 §41, §43): fallback to rule-based.
 */
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;
const MAX_USER_MESSAGE_LENGTH = 4000; // ~600 tokens — prevents resource exhaustion

/**
 * Wraps user content in <user_input> tags so the LLM treats it as DATA,
 * not instructions. This is the prompt-injection mitigation (Prompt 13 §4).
 *
 * Tags are stripped from the persisted message — only the user's original
 * text is stored. The wrapping is purely for the LLM call.
 */
function wrapUserContent(content: string): string {
  // Remove any <user_input> tags the user may have tried to inject themselves.
  const sanitized = content
    .replace(/<\/?user_input>/gi, "")
    .replace(/<\/?context>/gi, "")
    .replace(/<\/?system>/gi, "");
  return `<user_input>${sanitized}</user_input>`;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => null);
    if (!body || typeof body.message !== "string") {
      throw new AppError(ErrorCodes.INVALID_INPUT, "Expected { message: string }.");
    }

    // Rate limiting (Prompt 07 §39).
    const now = Date.now();
    const userRate = rateLimiter.get(userId);
    if (userRate && userRate.resetAt > now) {
      if (userRate.count >= RATE_LIMIT_MAX_REQUESTS) {
        throw new AppError(ErrorCodes.RATE_LIMITED, "Too many requests. Please slow down.");
      }
      userRate.count++;
    } else {
      rateLimiter.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }

    const userMessage = body.message as string;
    const locale = (body.locale ?? "en") as Locale;

    // Length cap — prevents resource exhaustion (Prompt 13 §4).
    if (userMessage.length > MAX_USER_MESSAGE_LENGTH) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        `Message is too long (max ${MAX_USER_MESSAGE_LENGTH} characters).`,
        { statusCode: 400 },
      );
    }

    // Medical safety check — takes PRIORITY (Prompt 07 §36, §38, §71).
    if (isMedicalQuery(userMessage)) {
      // Persist the conversation.
      const conversation = await getOrCreateConversation(userId, body.conversationId);
      await db.aIMessage.create({ data: { conversationId: conversation.id, role: "user", content: userMessage } });
      const medicalResponse = "I'm not able to provide medical advice or diagnose conditions. For questions about ADHD diagnosis or medication, please consult a qualified healthcare professional. I can still help with productivity and task management.";
      await db.aIMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: medicalResponse, metadata: JSON.stringify({ source: "deterministic", safety: "medical" }) } });
      return NextResponse.json({
        reply: medicalResponse,
        actions: [],
        source: "deterministic",
        conversationId: conversation.id,
      });
    }

    // Crisis check (Prompt 07 §37).
    if (isCrisisQuery(userMessage)) {
      const conversation = await getOrCreateConversation(userId, body.conversationId);
      await db.aIMessage.create({ data: { conversationId: conversation.id, role: "user", content: userMessage } });
      const crisisResponse = "It sounds like you're going through a really hard time. MindStep is not a crisis service. If you're in immediate danger, please contact your local emergency services or a crisis helpline. You deserve support from someone who can help right now.";
      await db.aIMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: crisisResponse, metadata: JSON.stringify({ source: "deterministic", safety: "crisis" }) } });
      return NextResponse.json({
        reply: crisisResponse,
        actions: [],
        source: "deterministic",
        conversationId: conversation.id,
      });
    }

    // Gather minimum-necessary context (Prompt 07 §7).
    const context = await gatherAIContext(userId, locale);

    // Load recent conversation history (last 5 messages — Prompt 14 §AI:
    // use the smallest useful context. 5 messages (2-3 turns) is sufficient
    // for contextual continuity without sending excessive history).
    const conversation = await getOrCreateConversation(userId, body.conversationId);
    const recentMessages = await db.aIMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { role: true, content: true },
    });
    const historyMessages: AIChatMessage[] = recentMessages
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));

    // Persist the user's message.
    await db.aIMessage.create({ data: { conversationId: conversation.id, role: "user", content: userMessage } });

    // Call the AI provider (Prompt 07 §3, §41, §43).
    // User content is wrapped in <user_input> tags for prompt-injection
    // defense (Prompt 13 §4). The persisted message retains the original text.
    const provider = await getAIProvider();
    let aiResponse;
    try {
      aiResponse = await provider.chat({
        messages: [
          ...historyMessages.map((m) => ({
            role: m.role,
            content: m.role === "user" ? wrapUserContent(m.content) : m.content,
          })),
          { role: "user" as const, content: wrapUserContent(userMessage) },
        ],
        locale,
        contextSummary: context.summary,
      });
    } catch (providerError) {
      // Provider failure — fallback to rule-based (Prompt 07 §41, §43).
      // SECURITY: do NOT log the user message or response — they may contain
      // sensitive personal data. Log only the error type.
      console.error("[/api/ai/chat] provider error type:", (providerError as Error)?.constructor?.name);
      const { RuleBasedProvider } = await import("@/lib/ai/provider");
      const fallback = new RuleBasedProvider();
      aiResponse = await fallback.chat({
        messages: [{ role: "user", content: userMessage }],
        locale,
        contextSummary: context.summary,
      });
    }

    // Persist the assistant's response.
    await db.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: aiResponse.message,
        metadata: JSON.stringify({
          source: aiResponse.source,
          actions: aiResponse.actions,
          provider: provider.name,
        }),
      },
    });

    // Update conversation title if it's still the default.
    if (conversation.title === "New conversation") {
      await db.aIConversation.update({
        where: { id: conversation.id },
        data: { title: userMessage.slice(0, 60) },
      });
    }

    return NextResponse.json({
      reply: aiResponse.message,
      actions: aiResponse.actions,
      source: aiResponse.source,
      conversationId: conversation.id,
      contextSummary: context.summary,
    });
  } catch (err) {
    // SECURITY: never log the error verbatim — it may contain user content
    // from a validation error or a provider error message. Log only the
    // type and code.
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    console.error("[/api/ai/chat] unexpected error type:", (err as Error)?.constructor?.name);
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}

async function getOrCreateConversation(userId: string, conversationId?: string) {
  if (conversationId) {
    const existing = await db.aIConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true, title: true },
    });
    if (existing && existing.userId === userId) return existing;
  }
  return db.aIConversation.create({ data: { userId, title: "New conversation" } });
}

/**
 * GET /api/ai/chat?conversationId=xxx
 * Returns conversation messages.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversationId");

    if (!conversationId) {
      // List conversations.
      const conversations = await db.aIConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, title: true, context: true, createdAt: true, updatedAt: true },
      });
      return NextResponse.json({ conversations });
    }

    // Verify ownership.
    const conversation = await db.aIConversation.findUnique({
      where: { id: conversationId },
      select: { userId: true },
    });
    if (!conversation) throw new AppError(ErrorCodes.NOT_FOUND, "Conversation not found.");
    if (conversation.userId !== userId) throw new AppError(ErrorCodes.NOT_OWNER, "Not your conversation.");

    const messages = await db.aIMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    return NextResponse.json({ messages, conversationId });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(toApiError(err), { status: err.statusCode });
    }
    return NextResponse.json(buildApiErrorResponse(err), { status: 500 });
  }
}
