/*
  Warnings:

  - You are about to drop the column `content_fts` on the `Chunk` table. All the data in the column will be lost.

*/
-- Drop the trigger first (it references the content_fts column)
DROP TRIGGER IF EXISTS chunk_content_fts_update ON "Chunk";

-- Drop the trigger function
DROP FUNCTION IF EXISTS chunk_content_fts_trigger();

-- DropIndex
DROP INDEX IF EXISTS "Chunk_content_fts_idx";

-- AlterTable
ALTER TABLE "Chunk" DROP COLUMN IF EXISTS "content_fts";
