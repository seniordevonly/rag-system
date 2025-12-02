"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search as SearchIcon,
  FileText,
  Link as LinkIcon,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { FileUploadDialog } from "@/components/file-management/file-upload-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Document {
  id: string;
  name: string;
  title: string;
  type: string;
  fileName?: string;
  fileSize?: number;
  dataset?: string;
  status: string;
  createdAt: string;
  _count: {
    chunks: number;
  };
}

const DEFAULT_PAGE_LIMIT = 50;
const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  processing: "secondary",
  failed: "destructive",
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "-";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

function PageHeader({ onAddFile }: { onAddFile: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">File Management</h1>
        <p className="text-muted-foreground">
          Manage your knowledge base documents and files
        </p>
      </div>
      <Button onClick={onAddFile}>
        <Plus className="mr-2 h-4 w-4" />
        Add File
      </Button>
    </div>
  );
}

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value)
          }
          className="pl-9"
        />
      </div>
    </div>
  );
}

interface DocumentRowProps {
  doc: Document;
  onDelete: (id: string, name: string) => void;
}

function DocumentRow({ doc, onDelete }: DocumentRowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {doc.type === "pdf" ? (
            <FileText className="h-4 w-4 text-muted-foreground" />
          ) : (
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="truncate max-w-[300px]">{doc.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{doc.type.toUpperCase()}</Badge>
      </TableCell>
      <TableCell>
        {doc.dataset ? (
          <Badge variant="secondary">{doc.dataset}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatFileSize(doc.fileSize)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {doc._count.chunks}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANTS[doc.status] || "outline"}>
          {doc.status}
        </Badge>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDelete(doc.id, doc.name)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function DocumentsTable({
  documents,
  loading,
  onDelete,
}: {
  documents: Document[];
  loading: boolean;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Dataset</TableHead>
            <TableHead>Upload Date</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Chunks</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center py-8 text-muted-foreground"
              >
                Loading...
              </TableCell>
            </TableRow>
          ) : documents.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center py-8 text-muted-foreground"
              >
                No documents found. Click "Add File" to get started.
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onDelete={onDelete} />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

function PaginationControls({
  page,
  total,
  limit,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">Total: {total} documents</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default function FileManagementPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: DEFAULT_PAGE_LIMIT.toString(),
      });
      if (search) params.append("search", search);

      const response = await fetch(`/api/documents?${params}`);
      if (!response.ok) throw new Error("Failed to fetch documents");

      const data = await response.json();
      setDocuments(data.documents);
      setTotal(data.pagination.total);
    } catch (_error) {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const response = await fetch(`/api/documents?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete document");

      toast.success("Document deleted successfully");
      void fetchDocuments();
    } catch (_error) {
      toast.error("Failed to delete document");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader onAddFile={() => setUploadDialogOpen(true)} />
      <SearchBar value={search} onChange={setSearch} />
      <DocumentsTable
        documents={documents}
        loading={loading}
        onDelete={handleDelete}
      />
      <PaginationControls
        page={page}
        total={total}
        limit={DEFAULT_PAGE_LIMIT}
        onPageChange={setPage}
      />
      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
      />
    </div>
  );
}
