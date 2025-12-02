import axios from "axios";
import * as cheerio from "cheerio";
import { chunkText } from "./chunker";
import type { TextChunk } from "./chunker";

export interface LinkMetadata {
  title?: string;
  description?: string;
  author?: string;
  publishDate?: Date;
  url: string;
  domain: string;
}

export interface LinkProcessResult {
  text: string;
  chunks: TextChunk[];
  metadata: LinkMetadata;
}

const FETCH_TIMEOUT_MS = 10000;
const USER_AGENT = "Mozilla/5.0 (compatible; RAGBot/1.0)";
const UNWANTED_SELECTORS =
  "script, style, nav, header, footer, aside, iframe, noscript, .advertisement, .ads, .sidebar, .comments";
const CONTENT_SELECTORS = [
  "article",
  "main",
  ".content",
  ".post-content",
  ".entry-content",
  "body",
];

/**
 * Process a web page and extract main content
 */
export async function processLink(url: string): Promise<LinkProcessResult> {
  validateURL(url);

  try {
    const response = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { "User-Agent": USER_AGENT },
    });

    const $ = cheerio.load(response.data);

    $(UNWANTED_SELECTORS).remove();

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("title").text() ||
      $("h1").first().text() ||
      "Untitled";

    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      $('meta[name="twitter:description"]').attr("content") ||
      "";

    const author =
      $('meta[name="author"]').attr("content") ||
      $('meta[property="article:author"]').attr("content") ||
      "";

    const publishDateStr =
      $('meta[property="article:published_time"]').attr("content") ||
      $('meta[name="publish_date"]').attr("content") ||
      "";

    const publishDate = publishDateStr ? new Date(publishDateStr) : undefined;

    let mainContent = "";
    for (const selector of CONTENT_SELECTORS) {
      mainContent = $(selector).text();
      if (mainContent) break;
    }

    mainContent = mainContent.replace(/\s+/g, " ").replace(/\n+/g, "\n").trim();

    const chunks = chunkText(mainContent, {}, { url });

    const urlObj = new URL(url);
    const metadata: LinkMetadata = {
      title,
      description,
      author: author || undefined,
      publishDate,
      url,
      domain: urlObj.hostname,
    };

    return {
      text: mainContent,
      chunks,
      metadata,
    };
  } catch (error) {
    console.error("Error processing link:", error);

    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(
          `Failed to fetch URL (${error.response.status}): ${url}`,
        );
      }
      if (error.request) {
        throw new Error(`Network error while fetching URL: ${url}`);
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to process link: ${message}`);
  }
}

/**
 * Validate URL format
 */
export function validateURL(url: string): void {
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      throw new Error("URL must use http or https protocol");
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid URL format";
    throw new Error(`Invalid URL: ${message}`);
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
