#!/bin/bash

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Testing Vireo Developer Waitlist API ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

API_URL="http://localhost:3050/api/v1/developers/waitlist"

# Test 1: Valid signup
echo -e "${BLUE}Test 1: Valid signup${NC}"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-'$(date +%s)'@example.com",
    "company": "Test Corp",
    "useCase": "Building a POS system"
  }')

if echo "$RESPONSE" | grep -q "success"; then
  echo -e "${GREEN}✓ Valid signup works${NC}"
else
  echo -e "${RED}✗ Valid signup failed${NC}"
  echo "$RESPONSE"
fi
echo ""

# Test 2: Duplicate email
echo -e "${BLUE}Test 2: Duplicate email prevention${NC}"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "duplicate@example.com",
    "company": "First Company",
    "useCase": "First attempt"
  }')

# Try the same email again
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "duplicate@example.com",
    "company": "Second Company",
    "useCase": "Second attempt"
  }')

if echo "$RESPONSE" | grep -q "already on the waitlist"; then
  echo -e "${GREEN}✓ Duplicate prevention works${NC}"
else
  echo -e "${RED}✗ Duplicate prevention failed${NC}"
  echo "$RESPONSE"
fi
echo ""

# Test 3: Invalid email
echo -e "${BLUE}Test 3: Invalid email validation${NC}"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "not-an-email",
    "company": "Test Corp",
    "useCase": "Testing"
  }')

if echo "$RESPONSE" | grep -q "email"; then
  echo -e "${GREEN}✓ Email validation works${NC}"
else
  echo -e "${RED}✗ Email validation failed${NC}"
  echo "$RESPONSE"
fi
echo ""

# Test 4: Missing required fields
echo -e "${BLUE}Test 4: Required field validation${NC}"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }')

if echo "$RESPONSE" | grep -q "company"; then
  echo -e "${GREEN}✓ Required field validation works${NC}"
else
  echo -e "${RED}✗ Required field validation failed${NC}"
  echo "$RESPONSE"
fi
echo ""

# Test 5: Optional use case
echo -e "${BLUE}Test 5: Optional use case field${NC}"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-optional-'$(date +%s)'@example.com",
    "company": "Test Corp"
  }')

if echo "$RESPONSE" | grep -q "success"; then
  echo -e "${GREEN}✓ Optional use case works${NC}"
else
  echo -e "${RED}✗ Optional use case failed${NC}"
  echo "$RESPONSE"
fi
echo ""

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           All Tests Complete           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
