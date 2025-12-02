import { openai } from "@ai-sdk/openai";
import { embedMany, embed } from "ai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_DELAY_MS = 100;

/**
 * Generate embeddings for multiple texts using OpenAI's embedding model
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: texts,
  });

  return embeddings;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: text,
  });

  return embedding;
}

/**
 * Process embeddings in batches to respect OpenAI rate limits
 */
export async function generateEmbeddingsInBatches(
  texts: string[],
  batchSize: number = 100,
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchEmbeddings = await generateEmbeddings(batch);
    embeddings.push(...batchEmbeddings);

    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return embeddings;
}
