#!/bin/bash

set -e

echo "🚀 Starting Next.js with production environment..."
echo ""

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found."
    echo ""
    echo "Please create a .env.production file in the project root with your production environment variables."
    echo ""
    echo "You can copy your production env variables directly into this file."
    exit 1
fi

echo "✅ Found .env.production"
echo "🔧 Starting Next.js dev server on port 3010..."
echo ""

# Kill any existing process on port 3010
lsof -ti:3010 | xargs kill -9 2>/dev/null || true

# Run Next.js with production env
dotenv -e .env.production -- next dev --turbopack -H 0.0.0.0 --port 3010
