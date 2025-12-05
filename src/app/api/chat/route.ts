import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { chatWithRAG, generateChatTitle } from "@/lib/ai/chat";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { hybridSearch, hybridSearchInDocuments } from "@/lib/db/vector-search";
import { rerankChunks } from "@/lib/ai/rerank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CONTEXT_CHUNKS = 5;
const SIMILARITY_THRESHOLD = 0.2;
const SEARCH_LIMIT = 50; // Reduced from 50 for faster search
const USE_RERANK = false; // Disable reranking by default (adds 3-5s latency)

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  chatId?: string;
  documentId?: string;
  documentIds?: string[]; // Support multiple documents
}

function validateMessages(
  messages: unknown,
): messages is ChatRequest["messages"] {
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(
      (msg) => typeof msg.role === "string" && typeof msg.content === "string",
    )
  );
}

/**
 * Chat endpoint with RAG
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const {
      messages,
      chatId: inputChatId,
      documentId,
      documentIds,
    } = body as ChatRequest;

    if (!validateMessages(messages)) {
      return NextResponse.json(
        { error: "Messages must be a non-empty array with role and content" },
        { status: 400 },
      );
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "user") {
      return NextResponse.json(
        { error: "Last message must be from user" },
        { status: 400 },
      );
    }

    // Use regular embedding instead of HyDE (much faster)
    const queryEmbedding = await generateEmbedding(lastMessage.content);

    // Determine which documents to search
    const targetDocIds =
      documentIds && documentIds.length > 0
        ? documentIds
        : documentId && typeof documentId === "string" && documentId.trim()
          ? [documentId]
          : [];

    // Perform hybrid search (vector + FTS with RRF)
    let relevantChunks =
      targetDocIds.length > 0
        ? await hybridSearchInDocuments(
            queryEmbedding,
            lastMessage.content,
            targetDocIds,
            SEARCH_LIMIT,
            SIMILARITY_THRESHOLD,
          )
        : await hybridSearch(
            queryEmbedding,
            lastMessage.content,
            SEARCH_LIMIT,
            SIMILARITY_THRESHOLD,
          );

    // Apply reranking if enabled
    if (USE_RERANK && relevantChunks.length > MAX_CONTEXT_CHUNKS) {
      relevantChunks = await rerankChunks(
        lastMessage.content,
        relevantChunks,
        MAX_CONTEXT_CHUNKS,
      );
    } else {
      relevantChunks = relevantChunks.slice(0, MAX_CONTEXT_CHUNKS);
    }

    const result = await chatWithRAG(
      messages as Parameters<typeof chatWithRAG>[0],
      relevantChunks,
    );

    // Get or create chat (optimized to not block response)
    const chatPromise = (async () => {
      try {
        let chat = inputChatId
          ? await prisma.chat.findUnique({ where: { id: inputChatId } })
          : null;

        if (!chat) {
          const title = await generateChatTitle(messages[0].content);
          chat = await prisma.chat.create({ data: { title } });
        }
        return chat;
      } catch (err) {
        console.error("Failed to get/create chat:", err);
        return null;
      }
    })();

    const sources = relevantChunks.map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      similarity: chunk.similarity,
      metadata: chunk.metadata,
    }));

    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    // Save messages in background after getting chat
    const chat = await chatPromise;
    if (chat) {
      await Promise.all([
        prisma.message.create({
          data: {
            chatId: chat.id,
            role: "user",
            content: lastMessage.content,
          },
        }),
        prisma.message.create({
          data: {
            chatId: chat.id,
            role: "assistant",
            content: fullText,
            sources: sources as never,
          },
        }),
      ]);
    }

    return NextResponse.json({
      message: fullText,
      sources,
      chatId: chat?.id,
    });
  } catch (error) {
    console.error("Chat error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
