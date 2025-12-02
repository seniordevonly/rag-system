#!/bin/bash

# RAG System Setup Script

echo "🚀 Setting up RAG System..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file. Please update it with your credentials."
    echo ""
fi

# Check for required tools
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required but not installed. Aborting."; exit 1; }

echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "🗄️  Setting up database..."
echo "⚠️  Make sure PostgreSQL is running and pgvector extension is installed"
echo ""

# Generate Prisma client
echo "📝 Generating Prisma client..."
npx prisma generate

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate dev --name init

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update .env with your OpenAI API key"
echo "2. Ensure PostgreSQL has pgvector extension enabled:"
echo "   psql -d seniordev_rag -c 'CREATE EXTENSION IF NOT EXISTS vector;'"
echo "3. Run 'pnpm dev' to start the development server"
echo ""
echo "🌐 The app will be available at http://localhost:3000"
