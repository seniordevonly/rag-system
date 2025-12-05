import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { hybridSearch } from "@/lib/db/vector-search";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_LIMIT = 10;
const SEARCH_LIMIT = 50;
const MIN_SIMILARITY = 0.2;

interface SearchRequest {
  query: string;
  limit?: number;
  documentId?: string;
}

/**
 * Search for documents and chunks using hybrid semantic + keyword search
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

    const { query, limit = DEFAULT_LIMIT, documentId } = body as SearchRequest;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query string is required" },
        { status: 400 },
      );
    }

    const queryEmbedding = await generateEmbedding(query);

    let chunks = await hybridSearch(
      queryEmbedding,
      query,
      Math.max(limit * 2, SEARCH_LIMIT),
      MIN_SIMILARITY,
    );

    if (documentId && typeof documentId === "string" && documentId.trim()) {
      chunks = chunks
        .filter((c) => c.documentId === documentId)
        .slice(0, limit);
    } else {
      chunks = chunks.slice(0, limit);
    }

    const documentIds = [...new Set(chunks.map((c) => c.documentId))];
    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: {
        id: true,
        title: true,
        type: true,
        url: true,
        createdAt: true,
      },
    });

    const docMap = new Map(documents.map((d) => [d.id, d]));

    const results = chunks
      .map((chunk) => {
        const doc = docMap.get(chunk.documentId);
        const pageNumbers =
          (chunk.metadata as { pageNumbers?: number[] })?.pageNumbers || [];

        return {
          id: chunk.id,
          content: chunk.content,
          similarity: chunk.similarity,
          pageNumbers,
          document: doc
            ? {
                id: doc.id,
                title: doc.title,
                type: doc.type,
                url: doc.url,
                createdAt: doc.createdAt,
              }
            : null,
        };
      })
      .filter((r) => r.document !== null);

    return NextResponse.json({
      results,
      query,
      count: results.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to perform search";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
