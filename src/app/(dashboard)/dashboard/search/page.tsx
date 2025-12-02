"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, FileText, ExternalLink, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { format } from "date-fns";

interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  pageNumbers: number[];
  document: {
    id: string;
    title: string;
    type: string;
    url: string | null;
    createdAt: Date;
  };
}

interface DocumentItem {
  id: string;
  title: string;
  type: string;
}

const SEARCH_RESULTS_LIMIT = 10;
const SIMILARITY_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.6,
};

const getSimilarityColor = (similarity: number): string => {
  if (similarity >= SIMILARITY_THRESHOLDS.HIGH) return "text-green-600";
  if (similarity >= SIMILARITY_THRESHOLDS.MEDIUM) return "text-yellow-600";
  return "text-orange-600";
};

function SearchHeader() {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold mb-2">AI Search</h1>
      <p className="text-muted-foreground">
        Semantic search across your documents using AI embeddings
      </p>
    </div>
  );
}

interface SearchFormProps {
  query: string;
  onQueryChange: (value: string) => void;
  selectedDocumentId: string;
  onDocumentSelect: (id: string) => void;
  documents: DocumentItem[];
  onSearch: (e: React.FormEvent) => void;
  isLoading: boolean;
}

function SearchForm({
  query,
  onQueryChange,
  selectedDocumentId,
  onDocumentSelect,
  documents,
  onSearch,
  isLoading,
}: SearchFormProps) {
  return (
    <Card className="mb-8">
      <CardContent className="pt-6">
        <form onSubmit={onSearch} className="flex gap-2 items-center">
          <div className="w-60">
            <label htmlFor="document-select" className="sr-only">
              Document
            </label>
            <select
              id="document-select"
              className="w-full rounded-md border px-3 py-2 bg-background"
              value={selectedDocumentId}
              onChange={(e) => onDocumentSelect(e.target.value)}
            >
              <option value="">All documents</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Ask a question or search for content..."
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={isLoading || !query.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Search
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="text-center py-12">
      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
      <p className="mt-4 text-muted-foreground">Searching...</p>
    </div>
  );
}

function NoResultsState() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No results found</h3>
        <p className="text-muted-foreground">
          Try adjusting your search query or upload more documents
        </p>
      </CardContent>
    </Card>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
}

function SearchResultItem({ result }: SearchResultItemProps) {
  const isLink = result.document.type === "LINK";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              {result.document.type === "PDF" ? (
                <FileText className="h-5 w-5" />
              ) : (
                <ExternalLink className="h-5 w-5" />
              )}
              {result.document.title}
            </CardTitle>
            <CardDescription className="mt-1">
              {isLink && result.document.url && (
                <a
                  href={result.document.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  {result.document.url}
                </a>
              )}
              {result.document.type === "PDF" && (
                <span className="text-sm">
                  {format(new Date(result.document.createdAt), "MMM d, yyyy")}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="secondary">{result.document.type}</Badge>
            <span
              className={`text-sm font-medium ${getSimilarityColor(
                result.similarity,
              )}`}
            >
              {(result.similarity * 100).toFixed(1)}% match
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {result.content}
        </p>
        {result.pageNumbers.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Pages:</span>
            {result.pageNumbers.map((page) => (
              <Badge key={page} variant="outline" className="text-xs">
                {page}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SearchResultsList({ results }: { results: SearchResult[] }) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          Found {results.length} result{results.length !== 1 ? "s" : ""}
        </h2>
      </div>
      <div className="space-y-4">
        {results.map((result) => (
          <SearchResultItem key={result.id} result={result} />
        ))}
      </div>
    </>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);

    try {
      const payload: Record<string, unknown> = {
        query,
        limit: SEARCH_RESULTS_LIMIT,
      };
      if (selectedDocumentId) payload.documentId = selectedDocumentId;

      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response
          .json()
          .catch(() => ({ error: "Search failed" }));
        throw new Error(err.error || "Search failed");
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <SearchHeader />
      <SearchForm
        query={query}
        onQueryChange={setQuery}
        selectedDocumentId={selectedDocumentId}
        onDocumentSelect={setSelectedDocumentId}
        documents={documents}
        onSearch={handleSearch}
        isLoading={loading}
      />
      {searched && (
        <div className="space-y-4">
          {loading ? (
            <LoadingState />
          ) : results.length > 0 ? (
            <SearchResultsList results={results} />
          ) : (
            <NoResultsState />
          )}
        </div>
      )}
    </div>
  );
}
