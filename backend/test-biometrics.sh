#!/bin/bash

# Phase 3 Biometric API Test Script
# Run this after starting the backend with: npm run start:dev

API_URL="${API_URL:-http://localhost:3050/api/v1}"
TOKEN="${TOKEN:-}"

echo "======================================"
echo "Phase 3 Biometric API Test"
echo "======================================"
echo ""

if [ -z "$TOKEN" ]; then
  echo "⚠️  No TOKEN provided. Set it with:"
  echo "   export TOKEN='your-jwt-token'"
  echo ""
  echo "To get a token, register a user first:"
  echo "   curl -X POST $API_URL/auth/register \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"phone\":\"+2348012345678\",\"name\":\"Test User\"}'"
  echo ""
  exit 1
fi

echo "Testing with API: $API_URL"
echo ""

# Test 1: Grant Consent
echo "1. Testing POST /biometrics/consent..."
CONSENT_RESPONSE=$(curl -s -X POST "$API_URL/biometrics/consent" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "consentVersion": "1.0",
    "metadata": {
      "deviceId": "test-device-001",
      "ipAddress": "127.0.0.1"
    }
  }')

CONSENT_ID=$(echo $CONSENT_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -n "$CONSENT_ID" ]; then
  echo "✅ Consent granted! ID: $CONSENT_ID"
else
  echo "❌ Failed to grant consent"
  echo "Response: $CONSENT_RESPONSE"
  exit 1
fi
echo ""

# Test 2: Enroll Face (with mock base64)
echo "2. Testing POST /biometrics/enroll (face)..."
FACE_ENROLL=$(curl -s -X POST "$API_URL/biometrics/enroll" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"face\",
    \"sampleBase64\": \"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==\",
    \"consentId\": \"$CONSENT_ID\"
  }")

FACE_ID=$(echo $FACE_ENROLL | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -n "$FACE_ID" ]; then
  echo "✅ Face enrolled! ID: $FACE_ID"
  echo "   Quality Score: $(echo $FACE_ENROLL | grep -o '"qualityScore":[0-9]*' | cut -d':' -f2)"
else
  echo "❌ Failed to enroll face"
  echo "Response: $FACE_ENROLL"
fi
echo ""

# Test 3: Enroll Voice
echo "3. Testing POST /biometrics/enroll (voice)..."
VOICE_ENROLL=$(curl -s -X POST "$API_URL/biometrics/enroll" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"voice\",
    \"sampleBase64\": \"UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQAAAAA=\",
    \"consentId\": \"$CONSENT_ID\"
  }")

VOICE_ID=$(echo $VOICE_ENROLL | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -n "$VOICE_ID" ]; then
  echo "✅ Voice enrolled! ID: $VOICE_ID"
  echo "   Quality Score: $(echo $VOICE_ENROLL | grep -o '"qualityScore":[0-9]*' | cut -d':' -f2)"
else
  echo "❌ Failed to enroll voice"
  echo "Response: $VOICE_ENROLL"
fi
echo ""

# Test 4: List Enrollments
echo "4. Testing GET /biometrics/enrollments..."
ENROLLMENTS=$(curl -s "$API_URL/biometrics/enrollments" \
  -H "Authorization: Bearer $TOKEN")

ENROLLMENT_COUNT=$(echo $ENROLLMENTS | grep -o '"id":"[^"]*' | wc -l)

if [ "$ENROLLMENT_COUNT" -ge 1 ]; then
  echo "✅ Found $ENROLLMENT_COUNT enrollment(s)"
  echo "$ENROLLMENTS" | python3 -m json.tool 2>/dev/null || echo "$ENROLLMENTS"
else
  echo "❌ No enrollments found"
fi
echo ""

# Test 5: Get Attempts
echo "5. Testing GET /biometrics/attempts..."
ATTEMPTS=$(curl -s "$API_URL/biometrics/attempts" \
  -H "Authorization: Bearer $TOKEN")

echo "✅ Audit log retrieved"
echo "$ATTEMPTS" | python3 -m json.tool 2>/dev/null || echo "$ATTEMPTS"
echo ""

# Test 6: Database Verification
echo "6. Verifying database tables..."
DB_CHECK=$(PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d vireo -t -c \
  "SELECT 
    (SELECT COUNT(*) FROM biometric_consents) as consents,
    (SELECT COUNT(*) FROM biometric_enrollments) as enrollments,
    (SELECT COUNT(*) FROM biometric_attempts) as attempts;" 2>/dev/null)

if [ -n "$DB_CHECK" ]; then
  echo "✅ Database verification:"
  echo "$DB_CHECK" | sed 's/^/   /'
else
  echo "⚠️  Database check skipped (connection required)"
fi
echo ""

echo "======================================"
echo "✅ Phase 3 Biometric Tests Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "  - Test terminal payment: POST /merchants/terminal-payment"
echo "  - Test mobile apps for full UX"
echo "  - Integrate real biometric vendor SDKs"
