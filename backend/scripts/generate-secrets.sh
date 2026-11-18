#!/bin/bash

# Generate secure secrets for deployment

echo "🔐 Generating secure secrets for Vireo Finance Backend"
echo ""
echo "⚠️  IMPORTANT: Save these somewhere secure (e.g., 1Password, AWS Secrets Manager)"
echo "   Losing encryption keys means data loss!"
echo ""

echo "# JWT & Authentication"
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "PIN_PEPPER=$(openssl rand -base64 48)"
echo ""

echo "# Biometric Encryption (Phase 3)"
echo "BIOMETRIC_ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo ""

echo "# KYC Encryption"
echo "KYC_ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo ""

echo "# Document Storage Encryption"
echo "DOCUMENT_ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo ""

echo "# Generate challenge nonces (128-bit)"
echo "CHALLENGE_NONCE_1=$(openssl rand -hex 16)"
echo "CHALLENGE_NONCE_2=$(openssl rand -hex 16)"
echo ""

echo "✅ Secrets generated successfully!"
echo ""
echo "📋 For Railway:"
echo "   railway variables set JWT_SECRET='<value>'"
echo ""
echo "📋 For Render:"
echo "   Add to Environment Variables in dashboard"
echo ""
echo "📋 For Docker:"
echo "   Add to .env file (never commit!)"
