"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Sparkles, FileText, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface Source {
  documentId: string;
  chunkId: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

interface Document {
  id: string;
  title: string;
  type?: string;
}

const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside mb-2">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside mb-2">{children}</ol>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  code: ({
    children,
    inline,
  }: {
    children?: React.ReactNode;
    inline?: boolean;
  }) => {
    if (inline) {
      return (
        <code className="bg-background/50 px-1.5 py-0.5 rounded text-xs font-mono">
          {children}
        </code>
      );
    }
    return (
      <div className="mb-2 overflow-x-auto">
        <pre className="bg-background/50 p-3 rounded">
          <code>{children}</code>
        </pre>
      </div>
    );
  },
} as const;

function MessageBubble({
  message,
  isUser,
}: {
  message: Message;
  isUser: boolean;
}) {
  return (
    <div
      className={cn("flex gap-3 p-4", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "flex gap-3 max-w-3xl",
          isUser ? "flex-row-reverse" : "flex-row",
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {isUser ? "You" : <Sparkles className="h-4 w-4" />}
        </div>

        <Card
          className={cn(
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          <CardContent className="p-3">
            {isUser ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>
            ) : (
              <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </CardContent>
        </Card>

        {!isUser && message.sources && message.sources.length > 0 && (
          <SourcesList sources={message.sources} />
        )}
      </div>
    </div>
  );
}

function SourcesList({ sources }: { sources: Source[] }) {
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  if (sources.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
        <FileText className="h-3 w-3" />
        Sources ({sources.length})
      </p>
      {sources.map((source, idx) => (
        <Card
          key={`${source.documentId}-${source.chunkId}`}
          className="bg-background/50 text-xs cursor-pointer hover:bg-background transition-colors"
          onClick={() =>
            setExpandedSource(
              expandedSource === source.chunkId ? null : source.chunkId,
            )
          }
        >
          <CardHeader className="p-2 pb-1">
            <CardTitle className="text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  [{idx + 1}]
                </Badge>
                {source.similarity && (
                  <span className="text-muted-foreground">
                    {(source.similarity * 100).toFixed(0)}% match
                  </span>
                )}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSource === source.chunkId && source.metadata && (
            <CardContent className="p-2 pt-0">
              <p className="text-xs text-muted-foreground">
                {typeof source.metadata.pageNumber === "number" && (
                  <>Page {source.metadata.pageNumber}</>
                )}
              </p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">Start a conversation</h2>
      <p className="text-muted-foreground max-w-md">
        Ask questions about your documents and get AI-powered answers
      </p>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex gap-3 p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Thinking...</span>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          ...(selectedDocumentIds.length > 0 && {
            documentIds: selectedDocumentIds,
          }),
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Failed to get response" }));
        throw new Error(error.error || "Chat failed");
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message,
          sources: data.sources,
        },
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get response";
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="border-b bg-background p-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">AI Chat</h1>
              <p className="text-sm text-muted-foreground">
                Ask questions about your documents
              </p>
            </div>
            <div className="w-64">
              <label htmlFor="chat-document-select" className="sr-only">
                Filter by Documents
              </label>
              {selectedDocumentIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {selectedDocumentIds.map((id) => {
                    const doc = documents.find((d) => d.id === id);
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="text-xs flex items-center gap-1"
                      >
                        {doc?.title || id}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() =>
                            setSelectedDocumentIds((prev) =>
                              prev.filter((i) => i !== id),
                            )
                          }
                        />
                      </Badge>
                    );
                  })}
                </div>
              )}
              <select
                id="chat-document-select"
                className="w-full rounded-md border px-3 py-2 bg-background text-sm"
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (value && !selectedDocumentIds.includes(value)) {
                    setSelectedDocumentIds((prev) => [...prev, value]);
                  }
                }}
              >
                <option value="">+ Add document filter</option>
                {documents
                  .filter((d) => !selectedDocumentIds.includes(d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-4xl">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isUser={message.role === "user"}
                />
              ))}
              {isLoading && <LoadingIndicator />}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      <div className="border-t bg-background p-4">
        <div className="container mx-auto max-w-4xl">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              type="text"
              placeholder="Ask a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
