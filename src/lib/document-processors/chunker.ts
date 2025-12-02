/**
 * Text chunking utility for splitting documents into smaller pieces with overlap
 */

export interface ChunkConfig {
  chunkSize: number;
  chunkOverlap: number;
  separators: string[];
}

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ["\n\n", "\n", ". ", " ", ""],
};

export interface TextChunk {
  content: string;
  metadata: {
    chunkIndex: number;
    startChar: number;
    endChar: number;
    [key: string]: unknown;
  };
}

const CHAR_PER_TOKEN = 4;
const SEPARATOR_MIN_POSITION_RATIO = 0.5;
const OVERLAP_RATIO = 0.2;

/**
 * Split text into chunks with overlap
 */
export function chunkText(
  text: string,
  config: Partial<ChunkConfig> = {},
  additionalMetadata: Record<string, unknown> = {},
): TextChunk[] {
  const { chunkSize, chunkOverlap, separators } = {
    ...DEFAULT_CHUNK_CONFIG,
    ...config,
  };

  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + chunkSize, text.length);

    if (endIndex < text.length) {
      const substring = text.substring(startIndex, endIndex);
      let bestSplitPoint = -1;

      for (const separator of separators) {
        if (separator === "") continue;

        const lastIndex = substring.lastIndexOf(separator);
        if (lastIndex > chunkSize * SEPARATOR_MIN_POSITION_RATIO) {
          bestSplitPoint = startIndex + lastIndex + separator.length;
          break;
        }
      }

      if (bestSplitPoint !== -1) {
        endIndex = bestSplitPoint;
      }
    }

    const content = text.substring(startIndex, endIndex).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        metadata: {
          chunkIndex,
          startChar: startIndex,
          endChar: endIndex,
          ...additionalMetadata,
        },
      });
      chunkIndex++;
    }

    startIndex = endIndex - chunkOverlap;

    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk && startIndex <= lastChunk.metadata.startChar) {
      startIndex = endIndex;
    }
  }

  return chunks;
}

/**
 * Chunk text with page information
 */
export function chunkTextWithPages(
  pages: Array<{ pageNumber: number; text: string }>,
  config: Partial<ChunkConfig> = {},
): TextChunk[] {
  const allChunks: TextChunk[] = [];

  for (const page of pages) {
    const pageChunks = chunkText(page.text, config, {
      pageNumber: page.pageNumber,
    });
    allChunks.push(...pageChunks);
  }

  return allChunks;
}

/**
 * Estimate token count (approximation: 1 token ≈ 4 characters)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHAR_PER_TOKEN);
}

/**
 * Get chunk config based on target token count
 */
export function getChunkConfigForTokens(
  targetTokens: number = 250,
): ChunkConfig {
  return {
    ...DEFAULT_CHUNK_CONFIG,
    chunkSize: targetTokens * CHAR_PER_TOKEN,
    chunkOverlap: Math.floor(targetTokens * CHAR_PER_TOKEN * OVERLAP_RATIO),
  };
}
