import { prisma } from "./prisma";

const VECTOR_DISTANCE_OPERATOR = "<=>"; // pgvector cosine distance operator
const RRF_K = 60; // Constant for Reciprocal Rank Fusion

export interface SimilarChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

interface RankedResult {
  id: string;
  rank: number;
  score: number;
}

/**
 * Reciprocal Rank Fusion (RRF) algorithm
 * Combines multiple ranked lists into a single ranking
 * Formula: RRF(d) = Σ(1 / (k + rank(d)))
 */
function reciprocalRankFusion(
  rankedLists: RankedResult[][],
  k: number = RRF_K,
): Map<string, number> {
  const rrfScores = new Map<string, number>();

  for (const rankedList of rankedLists) {
    for (const item of rankedList) {
      const currentScore = rrfScores.get(item.id) || 0;
      const rrfScore = 1 / (k + item.rank);
      rrfScores.set(item.id, currentScore + rrfScore);
    }
  }

  return rrfScores;
}

/**
 * Search for chunks similar to the query embedding using cosine similarity
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  limit: number = 5,
  minSimilarity: number = 0.7,
): Promise<SimilarChunk[]> {
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  return prisma.$queryRawUnsafe<SimilarChunk[]>(`
    SELECT 
      id::text,
      "documentId"::text,
      content,
      metadata,
      1 - (embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector) as similarity
    FROM "Chunk"
    WHERE embedding IS NOT NULL
      AND 1 - (embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector) >= ${minSimilarity}
    ORDER BY embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector
    LIMIT ${limit}
  `);
}

/**
 * Search for chunks within specific documents
 */
export async function searchSimilarChunksInDocuments(
  queryEmbedding: number[],
  documentIds: string[],
  limit: number = 5,
): Promise<SimilarChunk[]> {
  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  const docIdList = documentIds.map((id) => `'${id}'`).join(",");

  return prisma.$queryRawUnsafe<SimilarChunk[]>(`
    SELECT 
      id::text,
      "documentId"::text,
      content,
      metadata,
      1 - (embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector) as similarity
    FROM "Chunk"
    WHERE embedding IS NOT NULL
      AND "documentId" IN (${docIdList})
    ORDER BY embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector
    LIMIT ${limit}
  `);
}

/**
 * Hybrid search combining semantic similarity and keyword matching.
 * Uses Full-Text Search (FTS) with tsvector and RRF to merge results.
 * Improves results for acronyms and domain-specific terms.
 */
export async function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  limit: number = 10,
  minSimilarity: number = 0.2,
): Promise<SimilarChunk[]> {
  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  const searchLimit = limit * 2; // Get more candidates for RRF merging

  // Vector similarity search
  const semanticResults = await prisma.$queryRawUnsafe<SimilarChunk[]>(`
    SELECT 
      id::text,
      "documentId"::text,
      content,
      metadata,
      1 - (embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector) as similarity
    FROM "Chunk"
    WHERE embedding IS NOT NULL
      AND 1 - (embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector) >= ${minSimilarity}
    ORDER BY embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector
    LIMIT ${searchLimit}
  `);

  // Keyword search using ILIKE for simple text matching
  // This replaces the tsvector-based FTS since content_fts column was removed
  const keywords = queryText
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .map((word) => word.replace(/[^\w]/g, ""))
    .filter((word) => word.length > 2);

  if (keywords.length === 0) {
    // If no valid keywords, return semantic results only
    return semanticResults.slice(0, limit);
  }

  // Build ILIKE conditions for each keyword
  const likeConditions = keywords
    .map((keyword) => `content ILIKE '%${keyword}%'`)
    .join(" OR ");

  const ftsResults = await prisma.$queryRawUnsafe<
    (SimilarChunk & { rank: number })[]
  >(`
    SELECT 
      id::text,
      "documentId"::text,
      content,
      metadata,
      1 - (embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector) as similarity,
      1.0 as rank
    FROM "Chunk"
    WHERE (${likeConditions})
      AND embedding IS NOT NULL
    ORDER BY similarity DESC
    LIMIT ${searchLimit}
  `);

  // Create ranked lists for RRF
  const semanticRanked: RankedResult[] = semanticResults.map(
    (chunk, index) => ({
      id: chunk.id,
      rank: index + 1,
      score: chunk.similarity,
    }),
  );

  const ftsRanked: RankedResult[] = ftsResults.map((chunk, index) => ({
    id: chunk.id,
    rank: index + 1,
    score: chunk.rank,
  }));

  // Apply RRF to merge results
  const rrfScores = reciprocalRankFusion([semanticRanked, ftsRanked]);

  // Create a map of all chunks
  const chunkMap = new Map<string, SimilarChunk>();
  for (const chunk of semanticResults) {
    chunkMap.set(chunk.id, chunk);
  }
  for (const chunk of ftsResults) {
    if (!chunkMap.has(chunk.id)) {
      chunkMap.set(chunk.id, chunk);
    }
  }

  // Sort by RRF score and return top results
  const mergedResults = Array.from(rrfScores.entries())
    .map(([id]) => {
      const chunk = chunkMap.get(id);
      if (!chunk) return null;
      return {
        ...chunk,
        // Keep original semantic similarity for display, use RRF score only for sorting
        similarity: chunk.similarity,
      };
    })
    .filter((chunk): chunk is SimilarChunk => chunk !== null)
    .sort((a, b) => {
      const rrfA = rrfScores.get(a.id) || 0;
      const rrfB = rrfScores.get(b.id) || 0;
      return rrfB - rrfA;
    })
    .slice(0, limit);

  return mergedResults;
}

/**
 * Hybrid search within specific documents
 */
export async function hybridSearchInDocuments(
  queryEmbedding: number[],
  queryText: string,
  documentIds: string[],
  limit: number = 10,
  minSimilarity: number = 0.2,
): Promise<SimilarChunk[]> {
  if (documentIds.length === 0) {
    return hybridSearch(queryEmbedding, queryText, limit, minSimilarity);
  }

  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  const docIdList = documentIds.map((id) => `'${id}'`).join(",");
  const searchLimit = limit * 2;

  // Vector similarity search within documents
  const semanticResults = await prisma.$queryRawUnsafe<SimilarChunk[]>(`
    SELECT 
      id::text,
      "documentId"::text,
      content,
      metadata,
      1 - (embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector) as similarity
    FROM "Chunk"
    WHERE embedding IS NOT NULL
      AND "documentId" IN (${docIdList})
      AND 1 - (embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector) >= ${minSimilarity}
    ORDER BY embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector
    LIMIT ${searchLimit}
  `);

  // Full-Text Search within documents
  const tsQuery = queryText
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.replace(/[^\w]/g, ""))
    .filter((word) => word.length > 0)
    .join(" & ");

  if (!tsQuery) {
    return semanticResults.slice(0, limit);
  }

  const ftsResults = await prisma.$queryRawUnsafe<
    (SimilarChunk & { rank: number })[]
  >(`
    SELECT 
      id::text,
      "documentId"::text,
      content,
      metadata,
      1 - (embedding ${VECTOR_DISTANCE_OPERATOR} '${embeddingStr}'::vector) as similarity,
      ts_rank(content_fts, to_tsquery('english', '${tsQuery}')) as rank
    FROM "Chunk"
    WHERE content_fts @@ to_tsquery('english', '${tsQuery}')
      AND "documentId" IN (${docIdList})
      AND embedding IS NOT NULL
    ORDER BY rank DESC
    LIMIT ${searchLimit}
  `);

  // Apply RRF
  const semanticRanked: RankedResult[] = semanticResults.map(
    (chunk, index) => ({
      id: chunk.id,
      rank: index + 1,
      score: chunk.similarity,
    }),
  );

  const ftsRanked: RankedResult[] = ftsResults.map((chunk, index) => ({
    id: chunk.id,
    rank: index + 1,
    score: chunk.rank,
  }));

  const rrfScores = reciprocalRankFusion([semanticRanked, ftsRanked]);

  const chunkMap = new Map<string, SimilarChunk>();
  for (const chunk of semanticResults) {
    chunkMap.set(chunk.id, chunk);
  }
  for (const chunk of ftsResults) {
    if (!chunkMap.has(chunk.id)) {
      chunkMap.set(chunk.id, chunk);
    }
  }

  const mergedResults = Array.from(rrfScores.entries())
    .map(([id]) => {
      const chunk = chunkMap.get(id);
      if (!chunk) return null;
      return {
        ...chunk,
        // Keep original semantic similarity for display, use RRF score only for sorting
        similarity: chunk.similarity,
      };
    })
    .filter((chunk): chunk is SimilarChunk => chunk !== null)
    .sort((a, b) => {
      const rrfA = rrfScores.get(a.id) || 0;
      const rrfB = rrfScores.get(b.id) || 0;
      return rrfB - rrfA;
    })
    .slice(0, limit);

  return mergedResults;
}
