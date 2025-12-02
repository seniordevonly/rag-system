import { chunkTextWithPages } from "./chunker";
import type { TextChunk } from "./chunker";

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  pageCount: number;
}

interface PDF2JSONPage {
  Texts?: Array<{
    R?: Array<{
      T?: string;
    }>;
  }>;
}

interface PDF2JSONData {
  Meta?: {
    Title?: string;
    Author?: string;
    Subject?: string;
    Creator?: string;
    Producer?: string;
  };
  Pages?: PDF2JSONPage[];
}

interface PDF2JSONError {
  parserError: Error;
}

export interface PDFProcessResult {
  text: string;
  chunks: TextChunk[];
  metadata: PDFMetadata;
}

const PDF_MAGIC_NUMBER = "%PDF-";
const WHITESPACE_REGEX = /\s+/g;

/**
 * Process a PDF file and extract text with metadata
 */
export async function processPDF(
  buffer: Buffer,
  fileName: string,
): Promise<PDFProcessResult> {
  try {
    const PDFParser = (await import("pdf2json")).default;

    return new Promise<PDFProcessResult>((resolve, reject) => {
      const pdfParser = new PDFParser();

      pdfParser.on("pdfParser_dataError", (errData: Error | PDF2JSONError) => {
        const message =
          errData instanceof Error
            ? errData.message
            : errData.parserError?.message || "PDF parsing error";
        reject(new Error(message));
      });

      pdfParser.on("pdfParser_dataReady", (pdfData: PDF2JSONData) => {
        try {
          const metadata: PDFMetadata = {
            title: pdfData.Meta?.Title || fileName,
            author: pdfData.Meta?.Author,
            subject: pdfData.Meta?.Subject,
            creator: pdfData.Meta?.Creator,
            producer: pdfData.Meta?.Producer,
            pageCount: pdfData.Pages?.length || 0,
          };

          const pages = (pdfData.Pages || []).map(
            (page: PDF2JSONPage, index: number) => {
              const pageTexts: string[] = [];

              if (page.Texts && Array.isArray(page.Texts)) {
                for (const textItem of page.Texts) {
                  if (textItem.R && Array.isArray(textItem.R)) {
                    for (const run of textItem.R) {
                      if (run.T) {
                        pageTexts.push(run.T);
                      }
                    }
                  }
                }
              }

              return {
                pageNumber: index + 1,
                text: pageTexts.join(" ").replace(WHITESPACE_REGEX, " ").trim(),
              };
            },
          );

          const text = pages.map((p: { text: string }) => p.text).join("\n\n");
          const chunks = chunkTextWithPages(pages);

          resolve({
            text,
            chunks,
            metadata,
          });
        } catch (error) {
          reject(error);
        }
      });

      pdfParser.parseBuffer(buffer);
    });
  } catch (error) {
    console.error("Error processing PDF:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to process PDF: ${message}`);
  }
}

/**
 * Validate PDF file by checking magic number
 */
export function validatePDF(buffer: Buffer): boolean {
  const header = buffer.toString("utf-8", 0, PDF_MAGIC_NUMBER.length);
  return header === PDF_MAGIC_NUMBER;
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
