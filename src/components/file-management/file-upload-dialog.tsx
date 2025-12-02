"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Link as LinkIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SUPPORTED_FILE_TYPE = "application/pdf";
const API_UPLOAD_ENDPOINT = "/api/upload";
const BYTES_PER_MB = 1024 * 1024;

type UploadState = "idle" | "uploading";

function formatFileSize(bytes: number): string {
  return (bytes / BYTES_PER_MB).toFixed(2);
}

export function FileUploadDialog({
  open,
  onOpenChange,
}: FileUploadDialogProps) {
  const router = useRouter();
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [dataset, setDataset] = useState("");

  const isUploading = uploadState === "uploading";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== SUPPORTED_FILE_TYPE) {
      toast.error("Only PDF files are supported");
      return;
    }
    setFile(selectedFile);
  };

  const handlePdfUpload = async () => {
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setUploadState("uploading");
    const formData = new FormData();
    formData.append("file", file);
    if (dataset) formData.append("dataset", dataset);

    try {
      const response = await fetch(API_UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      toast.success(`Successfully uploaded ${data.document.name}`);
      setFile(null);
      setDataset("");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload file",
      );
    } finally {
      setUploadState("idle");
    }
  };

  const handleLinkUpload = async () => {
    if (!url) {
      toast.error("Please enter a URL");
      return;
    }

    setUploadState("uploading");

    try {
      const response = await fetch(API_UPLOAD_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, dataset: dataset || undefined }),
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      toast.success(`Successfully added ${data.document.name}`);
      setUrl("");
      setDataset("");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add link",
      );
    } finally {
      setUploadState("idle");
    }
  };

  const resetForm = () => {
    setFile(null);
    setUrl("");
    setDataset("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) resetForm();
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
          <DialogDescription>
            Upload a PDF file or add a web page link to your knowledge base.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="pdf" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
            <TabsTrigger value="link">Add Link</TabsTrigger>
          </TabsList>

          <TabsContent value="pdf" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="file">PDF File</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                disabled={isUploading}
              />
              {file && (
                <p className="text-sm text-muted-foreground">
                  {file.name} ({formatFileSize(file.size)} MB)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pdf-dataset">Dataset (Optional)</Label>
              <Input
                id="pdf-dataset"
                placeholder="e.g., Documentation, Research"
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
                disabled={isUploading}
              />
            </div>

            <Button
              onClick={handlePdfUpload}
              disabled={!file || isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload PDF
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="link" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="url">Web Page URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-dataset">Dataset (Optional)</Label>
              <Input
                id="link-dataset"
                placeholder="e.g., Documentation, Research"
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
                disabled={isUploading}
              />
            </div>

            <Button
              onClick={handleLinkUpload}
              disabled={!url || isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Add Link
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
