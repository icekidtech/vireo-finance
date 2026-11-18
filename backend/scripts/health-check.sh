#!/bin/bash

# Health check script for monitoring

URL="${1:-http://localhost:3050}"

echo "🏥 Checking health of $URL..."

# Check main health endpoint
if curl -sf "$URL/health" > /dev/null; then
    echo "✅ Health endpoint: OK"
else
    echo "❌ Health endpoint: FAILED"
    exit 1
fi

# Check database connectivity
HEALTH_RESPONSE=$(curl -s "$URL/health")
if echo "$HEALTH_RESPONSE" | grep -q '"database":"connected"'; then
    echo "✅ Database: Connected"
else
    echo "❌ Database: Disconnected"
    exit 1
fi

# Check Redis connectivity
if echo "$HEALTH_RESPONSE" | grep -q '"redis":"connected"'; then
    echo "✅ Redis: Connected"
else
    echo "❌ Redis: Disconnected"
    exit 1
fi

echo "✅ All health checks passed!"
