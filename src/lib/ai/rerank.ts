import type { SimilarChunk } from "../db/vector-search";

const RERANK_MODEL = "rerank-english-v3.0";
const RERANK_TOP_N = 5;

export interface RerankedChunk extends SimilarChunk {
  rerankScore: number;
  originalSimilarity: number;
}

/**
 * Rerank search results using Cohere's rerank model
 * This uses a cross-encoder that's more accurate than bi-encoder embeddings
 */
export async function rerankChunks(
  query: string,
  chunks: SimilarChunk[],
  topN: number = RERANK_TOP_N,
): Promise<RerankedChunk[]> {
  if (chunks.length === 0) {
    return [];
  }

  // If we have fewer chunks than requested, just return them all
  if (chunks.length <= topN) {
    return chunks.map((chunk) => ({
      ...chunk,
      rerankScore: chunk.similarity,
      originalSimilarity: chunk.similarity,
    }));
  }

  try {
    // Use Cohere's rerank API via AI SDK
    const documents = chunks.map((chunk) => chunk.content);

    // Note: Cohere rerank is available through their direct API
    // The AI SDK doesn't directly support rerank, so we'll use a similarity-based approach
    // For production, you'd want to use the Cohere SDK directly

    const CohereClient = (await import("cohere-ai")).CohereClient;
    const cohereApiKey = process.env.COHERE_API_KEY;

    if (!cohereApiKey) {
      console.warn("COHERE_API_KEY not set, skipping reranking");
      return chunks.slice(0, topN).map((chunk) => ({
        ...chunk,
        rerankScore: chunk.similarity,
        originalSimilarity: chunk.similarity,
      }));
    }

    const cohereClient = new CohereClient({ token: cohereApiKey });

    const reranked = await cohereClient.rerank({
      model: RERANK_MODEL,
      query,
      documents,
      topN,
      returnDocuments: false,
    });

    // Map reranked results back to chunks
    const rerankedChunks = reranked.results.map((result) => {
      const originalChunk = chunks[result.index];
      return {
        ...originalChunk,
        rerankScore: result.relevanceScore,
        originalSimilarity: originalChunk.similarity,
        similarity: result.relevanceScore, // Update similarity to rerank score
      };
    });

    return rerankedChunks;
  } catch (error) {
    console.error("Reranking failed, returning original results:", error);
    // Fallback: return top chunks by original similarity
    return chunks.slice(0, topN).map((chunk) => ({
      ...chunk,
      rerankScore: chunk.similarity,
      originalSimilarity: chunk.similarity,
    }));
  }
}

/**
 * Rerank with custom top-N parameter
 */
export async function rerankChunksCustom(
  query: string,
  chunks: SimilarChunk[],
  options: {
    topN?: number;
    model?: string;
  } = {},
): Promise<RerankedChunk[]> {
  const { topN = RERANK_TOP_N, model = RERANK_MODEL } = options;

  if (chunks.length === 0) {
    return [];
  }

  if (chunks.length <= topN) {
    return chunks.map((chunk) => ({
      ...chunk,
      rerankScore: chunk.similarity,
      originalSimilarity: chunk.similarity,
    }));
  }

  try {
    const CohereClient = (await import("cohere-ai")).CohereClient;
    const cohereApiKey = process.env.COHERE_API_KEY;

    if (!cohereApiKey) {
      return chunks.slice(0, topN).map((chunk) => ({
        ...chunk,
        rerankScore: chunk.similarity,
        originalSimilarity: chunk.similarity,
      }));
    }

    const cohereClient = new CohereClient({ token: cohereApiKey });
    const documents = chunks.map((chunk) => chunk.content);

    const reranked = await cohereClient.rerank({
      model,
      query,
      documents,
      topN,
      returnDocuments: false,
    });

    return reranked.results.map((result) => {
      const originalChunk = chunks[result.index];
      return {
        ...originalChunk,
        rerankScore: result.relevanceScore,
        originalSimilarity: originalChunk.similarity,
        similarity: result.relevanceScore,
      };
    });
  } catch (error) {
    console.error("Reranking failed:", error);
    return chunks.slice(0, topN).map((chunk) => ({
      ...chunk,
      rerankScore: chunk.similarity,
      originalSimilarity: chunk.similarity,
    }));
  }
}
