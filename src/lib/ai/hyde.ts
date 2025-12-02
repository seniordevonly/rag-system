import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { generateEmbedding } from "./embeddings";

const HYDE_MODEL = "gpt-4o-mini";
const HYDE_SYSTEM_PROMPT = `You are a helpful assistant that generates hypothetical answers to questions.
Given a user query, generate a detailed, informative answer that would likely be found in a knowledge base.
The answer should be comprehensive and factual, even though you don't have access to the actual documents.
This hypothetical answer will be used to improve search results.`;

/**
 * HyDE (Hypothetical Document Embeddings)
 * Generates a hypothetical answer to the query, then embeds it for better retrieval.
 * This improves semantic search by bridging the gap between questions and answers.
 */
export async function generateHydeEmbedding(query: string): Promise<number[]> {
  try {
    // Generate hypothetical answer
    const result = await generateText({
      model: openai(HYDE_MODEL),
      system: HYDE_SYSTEM_PROMPT,
      prompt: query,
      temperature: 0.7,
      maxRetries: 2,
    });

    const hypotheticalAnswer = result.text.trim();

    // Embed the hypothetical answer instead of the query
    return await generateEmbedding(hypotheticalAnswer);
  } catch (error) {
    console.error(
      "HyDE generation failed, falling back to direct query embedding:",
      error,
    );
    // Fallback: embed the original query
    return await generateEmbedding(query);
  }
}

/**
 * Generate both regular and HyDE embeddings for comparison
 */
export async function generateDualEmbeddings(query: string): Promise<{
  queryEmbedding: number[];
  hydeEmbedding: number[];
}> {
  const [queryEmbedding, hydeEmbedding] = await Promise.all([
    generateEmbedding(query),
    generateHydeEmbedding(query),
  ]);

  return { queryEmbedding, hydeEmbedding };
}
