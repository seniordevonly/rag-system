import { openai } from "@ai-sdk/openai";
import { streamText, generateText, type CoreMessage } from "ai";
import type { SimilarChunk } from "../db/vector-search";

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_CHAT_MODEL = "gpt-4o";
const DEFAULT_TITLE_MODEL = "gpt-4o-mini";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2000;

const DEFAULT_OPTIONS: ChatOptions = {
  model: DEFAULT_CHAT_MODEL,
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
};

const RAG_SYSTEM_PROMPT = `You are a helpful AI assistant with access to a knowledge base. Use the following context to answer questions thoroughly and accurately.

Context from knowledge base:
{context}

Guidelines:
- Provide detailed answers using information from the context above
- Extract and synthesize relevant information from all provided sources
- Cite sources using the [Source X] or [Page X] references when referencing specific information
- If information is not available in the context, clearly state what is missing
- Be thorough and informative while remaining accurate`;

/**
 * Generate a chat completion with RAG context
 */
export async function chatWithRAG(
  messages: CoreMessage[],
  relevantChunks: SimilarChunk[],
  options: ChatOptions = {},
) {
  const { model = DEFAULT_CHAT_MODEL, temperature = DEFAULT_TEMPERATURE } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const context = relevantChunks
    .map((chunk, index) => {
      const source = chunk.metadata?.pageNumber
        ? `Page ${chunk.metadata.pageNumber}`
        : `Source ${index + 1}`;
      return `[${source}]\n${chunk.content}`;
    })
    .join("\n\n---\n\n");

  const systemMessage: CoreMessage = {
    role: "system",
    content: RAG_SYSTEM_PROMPT.replace("{context}", context),
  };

  return streamText({
    model: openai(model),
    messages: [systemMessage, ...messages],
    temperature,
  });
}

/**
 * Generate a chat completion without RAG (general conversation)
 */
export async function chat(messages: CoreMessage[], options: ChatOptions = {}) {
  const { model = DEFAULT_CHAT_MODEL, temperature = DEFAULT_TEMPERATURE } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return streamText({
    model: openai(model),
    messages,
    temperature,
  });
}

/**
 * Generate a title for a chat based on the first message
 */
export async function generateChatTitle(firstMessage: string): Promise<string> {
  const result = await generateText({
    model: openai(DEFAULT_TITLE_MODEL),
    system:
      "Generate a short, descriptive title (3-6 words) for a chat based on the user's first message. Return only the title, nothing else.",
    prompt: firstMessage,
  });

  return result.text.trim() || "New Chat";
}
