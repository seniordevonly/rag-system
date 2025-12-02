-- Add full-text search support to Chunk table
-- This enables hybrid search combining vector similarity with keyword matching

-- Add tsvector column for full-text search
ALTER TABLE "Chunk" ADD COLUMN "content_fts" tsvector;

-- Create function to automatically update tsvector column
CREATE OR REPLACE FUNCTION chunk_content_fts_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_fts := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update content_fts on insert/update
CREATE TRIGGER chunk_content_fts_update
  BEFORE INSERT OR UPDATE OF content
  ON "Chunk"
  FOR EACH ROW
  EXECUTE FUNCTION chunk_content_fts_trigger();

-- Populate existing rows
UPDATE "Chunk" SET content_fts = to_tsvector('english', COALESCE(content, ''));

-- Create GIN index for fast full-text search
CREATE INDEX "Chunk_content_fts_idx" ON "Chunk" USING GIN (content_fts);