/**
 * Semantic chunking using sentence embeddings and similarity
 * Groups sentences together based on semantic coherence
 */

import { generateEmbedding } from "../ai/embeddings";
import nlp from "compromise";

export interface SemanticChunkConfig {
  maxChunkSize: number;
  minChunkSize: number;
  similarityThreshold: number;
  sentenceWindow: number;
}

export const DEFAULT_SEMANTIC_CONFIG: SemanticChunkConfig = {
  maxChunkSize: 1500,
  minChunkSize: 200,
  similarityThreshold: 0.75, // Sentences with similarity > this are grouped together
  sentenceWindow: 3, // Look ahead N sentences for grouping
};

export interface SemanticChunk {
  content: string;
  metadata: {
    chunkIndex: number;
    sentenceCount: number;
    avgSimilarity: number;
    [key: string]: unknown;
  };
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Split text into sentences using NLP
 */
function splitIntoSentences(text: string): string[] {
  const doc = nlp(text);
  const sentences = doc.sentences().out("array") as string[];
  return sentences.filter((s) => s.trim().length > 0);
}

/**
 * Chunk text semantically by grouping similar sentences
 */
export async function semanticChunk(
  text: string,
  config: Partial<SemanticChunkConfig> = {},
  additionalMetadata: Record<string, unknown> = {},
): Promise<SemanticChunk[]> {
  const { maxChunkSize, minChunkSize, similarityThreshold, sentenceWindow } = {
    ...DEFAULT_SEMANTIC_CONFIG,
    ...config,
  };

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Split into sentences
  const sentences = splitIntoSentences(text);

  if (sentences.length === 0) {
    return [];
  }

  // If text is short enough, return as single chunk
  if (text.length <= maxChunkSize) {
    return [
      {
        content: text.trim(),
        metadata: {
          chunkIndex: 0,
          sentenceCount: sentences.length,
          avgSimilarity: 1.0,
          ...additionalMetadata,
        },
      },
    ];
  }

  // Generate embeddings for each sentence (batch to reduce API calls)
  console.log(`Generating embeddings for ${sentences.length} sentences...`);
  const embeddings: number[][] = [];

  // Process in batches to avoid rate limits
  const batchSize = 20;
  for (let i = 0; i < sentences.length; i += batchSize) {
    const batch = sentences.slice(i, i + batchSize);
    const batchEmbeddings = await Promise.all(
      batch.map((sentence) => generateEmbedding(sentence)),
    );
    embeddings.push(...batchEmbeddings);
  }

  // Group sentences into chunks based on semantic similarity
  const chunks: SemanticChunk[] = [];
  let currentChunk: string[] = [sentences[0]];
  let currentSize = sentences[0].length;
  let chunkIndex = 0;
  let similarities: number[] = [];

  for (let i = 1; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceLength = sentence.length;

    // Calculate similarity with recent sentences in current chunk
    const lookbackStart = Math.max(0, currentChunk.length - sentenceWindow);
    const recentSentences = currentChunk.slice(lookbackStart);
    const recentIndices = Array.from(
      { length: recentSentences.length },
      (_, idx) => i - currentChunk.length + lookbackStart + idx,
    );

    const avgSimilarity =
      recentIndices.reduce((sum, idx) => {
        return sum + cosineSimilarity(embeddings[i], embeddings[idx]);
      }, 0) / recentIndices.length;

    similarities.push(avgSimilarity);

    // Decide whether to add to current chunk or start new one
    const wouldExceedMax = currentSize + sentenceLength > maxChunkSize;
    const isSimilar = avgSimilarity >= similarityThreshold;
    const meetsMinSize = currentSize >= minChunkSize;

    if (wouldExceedMax || (!isSimilar && meetsMinSize)) {
      // Finalize current chunk
      const chunkContent = currentChunk.join(" ").trim();
      const chunkAvgSimilarity =
        similarities.length > 0
          ? similarities.reduce((a, b) => a + b, 0) / similarities.length
          : 1.0;

      chunks.push({
        content: chunkContent,
        metadata: {
          chunkIndex,
          sentenceCount: currentChunk.length,
          avgSimilarity: chunkAvgSimilarity,
          ...additionalMetadata,
        },
      });

      // Start new chunk
      currentChunk = [sentence];
      currentSize = sentenceLength;
      similarities = [];
      chunkIndex++;
    } else {
      // Add to current chunk
      currentChunk.push(sentence);
      currentSize += sentenceLength;
    }
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join(" ").trim();
    const chunkAvgSimilarity =
      similarities.length > 0
        ? similarities.reduce((a, b) => a + b, 0) / similarities.length
        : 1.0;

    chunks.push({
      content: chunkContent,
      metadata: {
        chunkIndex,
        sentenceCount: currentChunk.length,
        avgSimilarity: chunkAvgSimilarity,
        ...additionalMetadata,
      },
    });
  }

  console.log(
    `Created ${chunks.length} semantic chunks from ${sentences.length} sentences`,
  );
  return chunks;
}

/**
 * Hybrid chunking: combine semantic and fixed-size approaches
 * Falls back to fixed-size if semantic chunking is too expensive
 */
export async function hybridChunk(
  text: string,
  additionalMetadata: Record<string, unknown> = {},
): Promise<SemanticChunk[]> {
  const sentences = splitIntoSentences(text);

  // Use semantic chunking for moderately-sized documents
  // For very large documents, this could be expensive
  if (sentences.length > 0 && sentences.length <= 100) {
    try {
      return await semanticChunk(text, {}, additionalMetadata);
    } catch (error) {
      console.error(
        "Semantic chunking failed, falling back to sentence-based:",
        error,
      );
    }
  }

  // Fallback: group by sentence boundaries but without embeddings
  const chunks: SemanticChunk[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;
  let chunkIndex = 0;
  const maxSize = 1500;

  for (const sentence of sentences) {
    if (currentSize + sentence.length > maxSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.join(" ").trim(),
        metadata: {
          chunkIndex,
          sentenceCount: currentChunk.length,
          avgSimilarity: 0,
          ...additionalMetadata,
        },
      });
      currentChunk = [];
      currentSize = 0;
      chunkIndex++;
    }
    currentChunk.push(sentence);
    currentSize += sentence.length;
  }

  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.join(" ").trim(),
      metadata: {
        chunkIndex,
        sentenceCount: currentChunk.length,
        avgSimilarity: 0,
        ...additionalMetadata,
      },
    });
  }

  return chunks;
}
