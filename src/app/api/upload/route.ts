import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { processPDF } from "@/lib/document-processors/pdf-processor";
import { processLink } from "@/lib/document-processors/link-processor";
import { generateEmbeddingsInBatches } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SUPPORTED_FILE_TYPE = "application/pdf";
const PDF_DOCUMENT_TYPE = "pdf";
const LINK_DOCUMENT_TYPE = "link";
const DOCUMENT_STATUS_READY = "ready";
const DOCUMENT_STATUS_FAILED = "failed";
const DOCUMENT_STATUS_PROCESSING = "processing";

interface DocumentResponse {
  id: string;
  name: string;
  type: string;
  status: string;
  chunkCount: number;
}

/**
 * Upload and process a PDF file or web link
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      return handlePDFUpload(request);
    }

    return handleLinkSubmission(request);
  } catch (error) {
    console.error("Upload error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to upload document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Handle PDF file upload
 */
async function handlePDFUpload(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File;
  const dataset = formData.get("dataset") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.type !== SUPPORTED_FILE_TYPE) {
    return NextResponse.json(
      { error: "Only PDF files are supported" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { text, chunks, metadata } = await processPDF(buffer, file.name);

  const document = await prisma.document.create({
    data: {
      name: file.name,
      title: metadata.title || file.name,
      type: PDF_DOCUMENT_TYPE,
      fileName: file.name,
      fileSize: file.size,
      content: text,
      dataset: dataset || undefined,
      status: DOCUMENT_STATUS_PROCESSING,
    },
  });

  const chunkData = chunks.map((chunk) => ({
    documentId: document.id,
    content: chunk.content,
    metadata: chunk.metadata as never,
  }));

  await prisma.chunk.createMany({ data: chunkData });

  generateEmbeddingsForDocument(document.id).catch(console.error);

  return NextResponse.json({
    success: true,
    document: formatDocumentResponse(document, chunks.length),
  });
}

/**
 * Handle web link submission
 */
async function handleLinkSubmission(request: NextRequest) {
  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { url, dataset } = body as { url?: string; dataset?: string };

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  const { text, chunks, metadata } = await processLink(url);

  const document = await prisma.document.create({
    data: {
      name: metadata.title || url,
      title: metadata.title || url,
      type: LINK_DOCUMENT_TYPE,
      url,
      content: text,
      dataset: dataset || undefined,
      status: DOCUMENT_STATUS_PROCESSING,
    },
  });

  const chunkData = chunks.map((chunk) => ({
    documentId: document.id,
    content: chunk.content,
    metadata: chunk.metadata as never,
  }));

  await prisma.chunk.createMany({ data: chunkData });

  generateEmbeddingsForDocument(document.id).catch(console.error);

  return NextResponse.json({
    success: true,
    document: formatDocumentResponse(document, chunks.length),
  });
}

/**
 * Format document response
 */
function formatDocumentResponse(
  document: { id: string; name: string; type: string; status: string },
  chunkCount: number,
): DocumentResponse {
  return {
    id: document.id,
    name: document.name,
    type: document.type,
    status: document.status,
    chunkCount,
  };
}

/**
 * Generate embeddings for all chunks in a document
 */
async function generateEmbeddingsForDocument(documentId: string) {
  try {
    const chunks = await prisma.chunk.findMany({
      where: { documentId },
      select: { id: true, content: true },
    });

    if (chunks.length === 0) {
      throw new Error("No chunks found for document");
    }

    const embeddings = await generateEmbeddingsInBatches(
      chunks.map((c) => c.content),
    );

    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = `[${embeddings[i].join(",")}]`;
      await prisma.$executeRaw`
        UPDATE "Chunk"
        SET embedding = ${embeddingStr}::vector
        WHERE id = ${chunks[i].id}
      `;
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { status: DOCUMENT_STATUS_READY },
    });

    console.log(`Successfully generated embeddings for document ${documentId}`);
  } catch (error) {
    console.error(
      `Failed to generate embeddings for document ${documentId}:`,
      error,
    );

    await prisma.document.update({
      where: { id: documentId },
      data: { status: DOCUMENT_STATUS_FAILED },
    });
  }
}
