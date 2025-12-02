#!/bin/bash

set -e

echo "🚀 Starting release process..."

# Install pnpm globally using npm
echo "📦 Installing pnpm..."
npm install -g pnpm@latest

# Verify pnpm installation
pnpm --version

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# Build the Next.js application
echo "📦 Building application..."
pnpm run build

# Generate Prisma client
echo "📝 Generating Prisma client..."
npx prisma generate

# Check if pgvector extension is enabled
echo "🔍 Checking pgvector extension..."

PGVECTOR_CHECK=$(npx prisma db execute --stdin <<EOF 2>&1 || true
SELECT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname = 'vector'
);
EOF
)

if echo "$PGVECTOR_CHECK" | grep -q "true\|t"; then
  echo "✅ pgvector extension is enabled"
else
  echo "⚠️  pgvector extension not found. Attempting to enable..."
  
  npx prisma db execute --stdin <<EOF || {
    echo "❌ Failed to enable pgvector extension."
    echo "Please ensure pgvector is installed on your PostgreSQL server."
    echo "You may need to run: CREATE EXTENSION IF NOT EXISTS vector;"
    exit 1
  }
CREATE EXTENSION IF NOT EXISTS vector;
EOF
  
  echo "✅ pgvector extension enabled successfully"
fi

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "✅ Release process completed successfully!"
