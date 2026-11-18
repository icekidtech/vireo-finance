#!/bin/bash
set -e

# Vireo Finance Backend - Railway Deployment Script

echo "🚀 Deploying Vireo Finance Backend to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Please login to Railway..."
    railway login
fi

# Check environment
read -p "Deploy to (staging/production): " ENV
if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "❌ Invalid environment. Use 'staging' or 'production'"
    exit 1
fi

# Confirm production deployment
if [[ "$ENV" == "production" ]]; then
    read -p "⚠️  Deploy to PRODUCTION? (yes/no): " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
        echo "❌ Deployment cancelled"
        exit 1
    fi
fi

# Switch to project
echo "📦 Selecting Railway project..."
railway project use vireo-backend-$ENV

# Build application
echo "🔨 Building application..."
npm ci
npm run build

# Run tests
echo "🧪 Running tests..."
npm run test || {
    echo "❌ Tests failed. Deployment aborted."
    exit 1
}

# Deploy
echo "🚢 Deploying to Railway..."
railway up

# Run migrations
echo "📊 Running database migrations..."
railway run npm run migration:run

# Health check
echo "🏥 Checking application health..."
sleep 30
DOMAIN=$(railway domain)
if curl -f "$DOMAIN/health" > /dev/null 2>&1; then
    echo "✅ Deployment successful!"
    echo "🌐 Application: $DOMAIN"
else
    echo "⚠️  Deployment completed but health check failed"
    echo "   Check logs: railway logs"
fi

echo "📝 View logs: railway logs"
echo "📊 View metrics: railway open"
