# Vireo Finance — API Reference & Integration Guide

Welcome to the official developer documentation for the **Vireo Finance** backend API. Vireo Finance is an agentic banking and merchant payments platform powered by:
- **NestJS** application framework with strict DTO validation.
- **PostgreSQL double-entry ledger** as the immutable source of truth for all balances.
- **Paga Business & Collect API rails** for virtual account provisioning, inbound deposit funding, and external bank payouts.
- **Hardware Enclave Key-Signing & Cryptographic Challenges** for biometric-backed transaction approvals with Apple App Attest and Google Play Integrity validation.
- **Email Notifications via Resend** for transactional onboarding, KYC updates, and inbound credit receipts.
- **Async BullMQ Redis Queues** for background webhook processing and scheduled ledger reconciliations.
- **Autonomous AI Banking Agent service (OpenAI GPT-4o)** with conversational function-calling and human-in-the-loop tool execution.

---

## Table of Contents

1. [Architectural Overview & Core Standards](#architectural-overview--core-standards)
2. [Postman Collection Setup & Automated Workflows](#postman-collection-setup--automated-workflows)
3. [End-to-End Quick Start Flow](#end-to-end-quick-start-flow)
4. [Endpoint Reference](#endpoint-reference)
   - [1. Health Module](#1-health-module)
   - [2. Authentication & Device Enclave](#2-authentication--device-enclave)
   - [3. KYC & Compliance (Paga-Native)](#3-kyc--compliance-paga-native)
   - [4. Accounts & Ledger Balances](#4-accounts--ledger-balances)
   - [5. Transfers & Payouts](#5-transfers--payouts)
   - [6. Agentic Banking](#6-agentic-banking)
   - [7. Merchant Services & In-Store Orders](#7-merchant-services--in-store-orders)
   - [8. Webhooks (Paga Callback Receiver)](#8-webhooks-paga-callback-receiver)
   - [9. Internal Operations & Reconciliation](#9-internal-operations--reconciliation)
5. [Error Handling & HTTP Status Codes](#error-handling--http-status-codes)

---

## Architectural Overview & Core Standards

### Base URL & Versioning
All API endpoints are served with the `/api/v1` global prefix:
```
http://localhost:3050/api/v1
```

### Authentication Scheme
- **Mechanism**: Bearer JWT tokens.
- **Header**: `Authorization: Bearer <token>`
- **Issuance**: Handled via email and password authentication (`POST /auth/login`).
- **Expiry**: Default 7 days (`JWT_EXPIRES_IN=7d`).

### Financial Minor Units & Money Formatting
To eliminate IEEE-754 floating point imprecision:
- **Internal Storage**: All ledger calculations, risk limits, and account balances are stored in minor units as 64-bit BigInts (kobo in Nigeria: `1 NGN = 100 kobo`).
- **API Boundaries**: Request inputs and response outputs format amounts as decimal strings with up to 2 decimal places (e.g. `"1500.00"` represents ₦1,500.00).

### Cryptographic Nonces & Approval Challenges
Vireo separates **transfer drafting** from **transfer execution**:
1. When a user or agent drafts a transfer, the server validates limits, places a ledger hold reserving the funds, and generates a **Challenge**:
   - `nonce`: Cryptographically secure random hex string.
   - `payloadHash`: SHA-256 hash of the canonical JSON payload (`amountMinor`, `recipient`, `type`, etc.).
   - `expiresAt`: TTL timestamp (default 120 seconds).
2. The user's mobile client prompts for biometric authorization (FaceID / TouchID / Biometric Keystore), signs the utf8 bytes of `payloadHash` using the registered hardware private key (Ed25519 or NIST P-256), and submits the base64 signature to `/transfers/:id/submit`.

### Idempotency Standard
Every transfer and payment movement requires a unique client-generated `idempotencyKey` (8–120 characters). Retrying with the exact same key returns the existing transfer and challenge without double-charging or creating duplicate ledger entries.

---

## Postman Collection Setup & Automated Workflows

A complete, production-grade Postman collection is maintained directly in the repository at:
- `backend/docs/vireo_finance.postman_collection.json`
- `docs/vireo_finance.postman_collection.json`

### Importing into Postman / Insomnia / Bruno
1. Open Postman or your preferred API client.
2. Click **Import** and select `vireo_finance.postman_collection.json`.
3. The collection is configured with default collection variables:
   - `baseUrl`: `http://localhost:3050/api/v1`
   - `jwtToken`: Empty initially, populated automatically.
   - `registeredDeviceId`: Automatically populated when you register a device.
   - `transferDraftId`: Automatically populated when drafting a transfer.
   - `agentSessionId`: Automatically populated when creating an agent session.
   - `orderReference`: Automatically populated when creating a merchant order.
   - `internalToken`: Operations authorization token.

### Automated Test Scripts
The collection contains embedded Postman Test scripts that chain requests seamlessly:
- **Login (Email & Password)**: Automatically parses `accessToken` and updates `{{jwtToken}}`.
- **Register Device**: Automatically saves the newly generated `id` into `{{registeredDeviceId}}`.
- **Create Transfer Draft**: Automatically saves `transfer.id` into `{{transferDraftId}}`.
- **Create Agent Session**: Automatically saves `id` into `{{agentSessionId}}`.
- **Chat with AI Agent**: Automatically tracks `agentSessionId` across multi-turn prompts.
- **Create Merchant Order**: Automatically saves `reference` into `{{orderReference}}`.

---

## End-to-End Quick Start Flow

```
1. POST /auth/register
   ↳ Register email, password, name → Provisions Wallet + Paga Virtual Account + Welcome Email
2. POST /auth/login
   ↳ Authenticates via bcrypt → Postman stores Bearer JWT in {{jwtToken}}
3. POST /auth/devices
   ↳ Registers hardware enclave key with Apple App Attest / Google Play Integrity validation
4. POST /kyc/identification
   ↳ Uploads ID document to Paga → Upgrades user to Tier 1/2 limits
5. GET /accounts/me
   ↳ Inspect ledger balance and virtual account details
6. POST /agent/chat
   ↳ Natural-language conversational banking with OpenAI GPT-4o autonomous tool dispatch
7. POST /transfers/drafts
   ↳ Creates transfer draft & cryptographic challenge hold
8. POST /transfers/:id/submit
   ↳ Submits base64 device signature to finalize transfer
```

---

## Endpoint Reference

### 1. Health Module

#### GET `/health`
Returns system uptime and tests PostgreSQL database connectivity.

- **Authentication**: None (Public)
- **Headers**: `Accept: application/json`

**Response Example (200 OK — Healthy):**
```json
{
  "status": "ok",
  "database": "up",
  "uptime": 1420,
  "timestamp": "2026-11-14T02:00:00.000Z"
}
```

**Response Example (200 OK — Degraded):**
```json
{
  "status": "degraded",
  "database": "down",
  "uptime": 1420,
  "timestamp": "2026-11-14T02:00:00.000Z"
}
```

---

### 2. Authentication & Device Enclave

#### POST `/auth/register`
Onboards a user with email and password, creates an immutable wallet in the ledger, provisions a Paga virtual account, and dispatches a welcome email via Resend.

- **Authentication**: None (Public)
- **Headers**: `Content-Type: application/json`

**Request Body Schema:**
| Field | Type | Required | Description / Rules |
| :--- | :--- | :--- | :--- |
| `email` | string | Yes | Valid email address for login and notifications |
| `password` | string | Yes | Minimum 8 characters (hashed with bcrypt 10 rounds) |
| `name` | string | Yes | Full legal or display name (2–120 characters) |
| `phone` | string | No | E.164 format for Paga customer registration |
| `handle` | string | No | Unique user handle (3–20 alphanumeric chars or `_`) |
| `dateOfBirth` | string | No | ISO date format `YYYY-MM-DD` |

**Request Example:**
```json
{
  "email": "amina@example.com",
  "password": "SecurePassword123!",
  "name": "Amina Bello",
  "phone": "+2348012345678",
  "handle": "aminabello",
  "dateOfBirth": "1995-05-15"
}
```

**Response Example (201 Created — New User):**
```json
{
  "user": {
    "id": "7f0a82cf-9c6f-42e1-85b8-5fdfa9f73301",
    "phone": "+2348012345678",
    "handle": "aminabello",
    "name": "Amina Bello",
    "email": "amina@example.com",
    "dateOfBirth": "1995-05-15",
    "kycTier": 0,
    "status": "active",
    "createdAt": "2026-11-14T02:05:00.000Z"
  },
  "created": true
}
```

**Response Example (200 OK — Existing User):**
```json
{
  "user": {
    "id": "7f0a82cf-9c6f-42e1-85b8-5fdfa9f73301",
    "phone": "+2348012345678",
    "handle": "aminabello",
    "name": "Amina Bello",
    "email": "amina@example.com",
    "dateOfBirth": "1995-05-15",
    "kycTier": 0,
    "status": "active",
    "createdAt": "2026-11-14T02:05:00.000Z"
  },
  "created": false
}
```

---

#### POST `/auth/login`
Authenticates user credentials using email and bcrypt password verification, returning a signed JWT access token.

- **Authentication**: None (Public)
- **Headers**: `Content-Type: application/json`

**Request Body Schema:**
| Field | Type | Required | Description / Rules |
| :--- | :--- | :--- | :--- |
| `email` | string | Yes | Registered user email |
| `password` | string | Yes | Account password |

**Request Example:**
```json
{
  "email": "amina@example.com",
  "password": "SecurePassword123!"
}
```

**Response Example (200 OK — Success):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "7f0a82cf-9c6f-42e1-85b8-5fdfa9f73301",
    "phone": "+2348012345678",
    "handle": "aminabello",
    "name": "Amina Bello",
    "email": "amina@example.com",
    "dateOfBirth": "1995-05-15",
    "kycTier": 0,
    "status": "active",
    "createdAt": "2026-11-14T02:05:00.000Z"
  }
}
```

**Response Example (401 Unauthorized — Invalid Credentials):**
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

---

#### GET `/auth/me`
Fetches the currently authenticated profile.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

**Response Example (200 OK):**
```json
{
  "id": "7f0a82cf-9c6f-42e1-85b8-5fdfa9f73301",
  "phone": "+2348012345678",
  "handle": "aminabello",
  "name": "Amina Bello",
  "email": "amina@example.com",
  "dateOfBirth": "1995-05-15",
  "kycTier": 0,
  "status": "active",
  "createdAt": "2026-11-14T02:05:00.000Z"
}
```

---

#### POST `/auth/devices`
Registers an asymmetric public key generated inside a mobile hardware enclave (Apple Secure Enclave, Android StrongBox/Keystore) and verifies hardware authenticity.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)
- **Attestation Validation Engine**:
  - **iOS**: Attestation object decoded from CBOR and certificate chain cryptographically verified against the official Apple App Attestation Root CA certificate.
  - **Android**: Attestation token decoded and verified via the Google Play Integrity API.
  - Returns `attestationState: "verified"` on cryptographic success, or `"failed"` / `"unverified"`.

**Request Body Schema:**
| Field | Type | Required | Description / Rules |
| :--- | :--- | :--- | :--- |
| `publicKey` | string | Yes | Base64-encoded public key (SPKI DER or raw key) |
| `platform` | string | Yes | One of: `"ios"`, `"android"` |
| `algorithm` | string | No | `"ed25519"` (default) or `"es256"` |
| `attestationToken` | string | No | Hardware attestation payload validating enclave authenticity |

**Request Example:**
```json
{
  "publicKey": "MCowBQYDK2VwAyEAX5nQ8LhF3z0F8lO4v1P2m9K0e8s3T2u1w0y9z8x7w6v=",
  "platform": "ios",
  "algorithm": "ed25519",
  "attestationToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response Example (201 Created — Verified):**
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "platform": "ios",
  "algorithm": "ed25519",
  "attestationState": "verified",
  "status": "active",
  "createdAt": "2026-11-14T02:06:00.000Z"
}
```
}
```

---

#### GET `/auth/devices`
Lists all enrolled signing devices for the authenticated user.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

**Response Example (200 OK):**
```json
[
  {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "platform": "ios",
    "algorithm": "ed25519",
    "attestationState": "provided",
    "status": "active",
    "createdAt": "2026-11-14T02:06:00.000Z"
  }
]
```

---

#### POST `/auth/devices/:id/revoke`
Revokes an enrolled device key. Immediately blocks the device from signing future challenges.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

**Response Example (200 OK):**
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "platform": "ios",
  "algorithm": "ed25519",
  "attestationState": "provided",
  "status": "revoked",
  "createdAt": "2026-11-14T02:06:00.000Z"
}
```

---

### 3. KYC & Compliance (Paga-Native)

#### POST `/kyc/identification`
Uploads a national identity document, passport, driver's license, or voter's card to Paga via `registerCustomerIdentification`. Upon Paga approval, automatically promotes the user's KYC tier (`kycTier: 1` or `2`) and increases their daily transfer limits.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

**Request Body Schema:**
| Field | Type | Required | Description / Rules |
| :--- | :--- | :--- | :--- |
| `idType` | string | Yes | One of: `"PASSPORT"`, `"NATIONAL_ID"`, `"VOTERS_CARD"`, `"DRIVER_LICENSE"` |
| `idNumber` | string | Yes | Document identification number (4–60 characters) |
| `expirationDate` | string | No | Expiration date formatted as `YYYY-MM-DD` |
| `idPhoto` | string | No | Base64-encoded image data or file URL |
| `targetTier` | number | No | `1` or `2` (defaults to 2 for National ID/Passport, 1 for Voter's Card) |

**Request Example:**
```json
{
  "idType": "NATIONAL_ID",
  "idNumber": "12345678901",
  "expirationDate": "2030-01-01",
  "idPhoto": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "targetTier": 2
}
```

**Response Example (201 Created — Verified & Upgraded):**
```json
{
  "kycRecord": {
    "id": "4d1a2b3c-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "tier": 2,
    "provider": "paga",
    "status": "verified",
    "verifiedAt": "2026-11-14T10:35:00.000Z",
    "createdAt": "2026-11-14T10:35:00.000Z"
  },
  "userTier": 2,
  "dailyLimit": "200000.00",
  "status": "verified",
  "message": "Identification verified successfully. Your account has been upgraded to Tier 2."
}
```

---

#### GET `/kyc/status`
Retrieves the user's current verified KYC tier, current daily limit, tier limits schedule, and latest document review details.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

**Response Example (200 OK):**
```json
{
  "userId": "7f0a82cf-9c6f-42e1-85b8-5fdfa9f73301",
  "kycTier": 2,
  "dailyLimit": "200000.00",
  "currency": "NGN",
  "latestVerification": {
    "id": "4d1a2b3c-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "tier": 2,
    "provider": "paga",
    "status": "verified",
    "verifiedAt": "2026-11-14T10:35:00.000Z",
    "createdAt": "2026-11-14T10:35:00.000Z"
  },
  "tierLimits": {
    "tier0": "20000.00",
    "tier1": "50000.00",
    "tier2": "200000.00"
  }
}
```

---

#### GET `/kyc/history`
Returns historical KYC document submissions and compliance audit trail.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

**Response Example (200 OK):**
```json
[
  {
    "id": "4d1a2b3c-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "tier": 2,
    "provider": "paga",
    "status": "verified",
    "verifiedAt": "2026-11-14T10:35:00.000Z",
    "createdAt": "2026-11-14T10:35:00.000Z"
  }
]
```

---

### 4. Accounts & Ledger Balances

#### GET `/accounts/me`
Returns current available and held double-entry ledger balances, along with the user's dedicated Paga virtual account for inbound bank funding.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

**Response Example (200 OK):**
```json
{
  "accountId": "a3bb189e-8bf9-3888-9912-ace4e6543002",
  "currency": "NGN",
  "balance": "250000.00",
  "held": "0.00",
  "available": "250000.00",
  "virtualAccount": {
    "accountNumber": "9912345678",
    "bankName": "Paga",
    "status": "active"
  }
}
```

---

### 5. Transfers & Payouts

#### POST `/transfers/drafts`
Initiates a transfer draft across one of three supported rails:
1. `internal`: Peer-to-peer between Vireo users (fee: ₦0.00).
2. `bank`: External Nigerian commercial bank payout via Paga (fee: ₦100.00).
3. `merchant`: Payment for an in-store merchant order (fee: ₦0.00).

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

**Request Body Schema:**
| Field | Type | Required | Description / Rules |
| :--- | :--- | :--- | :--- |
| `type` | string | Yes | `"internal"`, `"bank"`, or `"merchant"` |
| `amount` | string | Yes | Positive decimal amount (e.g. `"5000.00"`) |
| `idempotencyKey` | string | Yes | Unique client UUID/nonce (8–120 characters) |
| `deviceId` | string | Yes | UUID of the registered hardware device |
| `recipientHandle` | string | Conditional | Handle for `internal` transfers |
| `recipientPhone` | string | Conditional | Phone for `internal` transfers |
| `recipientUserId` | string | Conditional | UUID for `internal` transfers |
| `bankCode` | string | Conditional | 3-digit CBN bank code for `bank` transfers (e.g. `"044"`) |
| `accountNumber` | string | Conditional | 10-digit NUBAN account number for `bank` transfers |
| `orderReference` | string | Conditional | Order reference string for `merchant` transfers |

**Internal Transfer Draft Request Example:**
```json
{
  "type": "internal",
  "amount": "5000.00",
  "idempotencyKey": "p2p_draft_test_0001",
  "deviceId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "recipientHandle": "chidi"
}
```

**Response Example (201 Created):**
```json
{
  "transfer": {
    "id": "c1f7a0b5-4b31-4190-bd20-0d3a77800001",
    "type": "internal",
    "status": "draft",
    "amount": "5000.00",
    "fee": "0.00",
    "currency": "NGN",
    "recipientName": "Chidi Anagonye",
    "recipientPhone": "+2348023456789",
    "recipientBankCode": null,
    "recipientAccountNumber": null,
    "pagaReference": null,
    "failureReason": null,
    "challengeId": "e2808c4d-72e5-4bb6-bda1-70bfb72a4431",
    "createdAt": "2026-11-14T02:10:00.000Z",
    "updatedAt": "2026-11-14T02:10:00.000Z"
  },
  "challenge": {
    "id": "e2808c4d-72e5-4bb6-bda1-70bfb72a4431",
    "type": "device_key",
    "nonce": "9a38ef025c81d80b72a85e13d94186ef",
    "payload": {
      "transferId": "c1f7a0b5-4b31-4190-bd20-0d3a77800001",
      "type": "internal",
      "amountMinor": "500000",
      "feeMinor": "0",
      "recipientUserId": "8d39f7a1-5c2e-4a61-9c1b-2d8e4f1a2b3c",
      "recipientPhone": "+2348023456789"
    },
    "payloadHash": "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
    "expiresAt": "2026-11-14T02:12:00.000Z"
  }
}
```

---

#### POST `/transfers/:id/submit`
Verifies the client signature of the challenge's `payloadHash` against the enrolled device public key and finalizes the transaction.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

**Request Example:**
```json
{
  "signature": "MC4CAQACBQDY...base64Signature..."
}
```

**Response Example (200 OK — Internal Transfer Completed):**
```json
{
  "id": "c1f7a0b5-4b31-4190-bd20-0d3a77800001",
  "type": "internal",
  "status": "completed",
  "amount": "5000.00",
  "fee": "0.00",
  "currency": "NGN",
  "recipientName": "Chidi Anagonye",
  "recipientPhone": "+2348023456789",
  "recipientBankCode": null,
  "recipientAccountNumber": null,
  "pagaReference": null,
  "failureReason": null,
  "challengeId": "e2808c4d-72e5-4bb6-bda1-70bfb72a4431",
  "createdAt": "2026-11-14T02:10:00.000Z",
  "updatedAt": "2026-11-14T02:10:05.000Z"
}
```

**Response Example (200 OK — Bank Payout In-Flight):**
```json
{
  "id": "d2f8a1c6-5b42-4291-ce31-1e4b88911102",
  "type": "bank",
  "status": "pending",
  "amount": "12500.00",
  "fee": "100.00",
  "currency": "NGN",
  "recipientName": "Babatunde Raji",
  "recipientPhone": null,
  "recipientBankCode": "044",
  "recipientAccountNumber": "0123456789",
  "pagaReference": "PAGA-PAYOUT-77889900",
  "failureReason": null,
  "challengeId": "f3919d5e-83f6-4cc7-ceb2-81cgc83b5542",
  "createdAt": "2026-11-14T02:11:00.000Z",
  "updatedAt": "2026-11-14T02:11:04.000Z"
}
```

---

#### GET `/transfers`
Lists transfers for the user.

- **Query Parameters**: `limit` (optional integer, default: 50).
- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

---

#### GET `/transfers/:id`
Retrieves a single transfer by UUID.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)

---

### 6. Agentic Banking

The agent service runs with a **strictly bounded tool layer** with draft-only permissions for monetary actions, powered by an autonomous **OpenAI GPT-4o** conversational loop.

#### POST `/agent/chat`
Conversational endpoint for the AI banking assistant. Automatically runs the OpenAI function-calling loop, executing backend tools (`get_balance`, `list_transactions`, `validate_recipient`, `create_transfer_draft`, `create_payment_request`, `explain_fee`) and replying in clear natural language.

- **Authentication**: Bearer JWT (`Authorization: Bearer <token>`)
- **Headers**: `Content-Type: application/json`

**Request Body Schema:**
| Field | Type | Required | Description / Rules |
| :--- | :--- | :--- | :--- |
| `sessionId` | string (UUID) | No | Active agent session ID. Created automatically if omitted. |
| `message` | string | Yes | User's natural-language banking query or command |

**Request Example:**
```json
{
  "sessionId": "11223344-5566-7788-99aa-bbccddeeff00",
  "message": "What is my current available balance and explain the fee for sending money to a bank?"
}
```

**Response Example (201 Created):**
```json
{
  "sessionId": "11223344-5566-7788-99aa-bbccddeeff00",
  "reply": "Your available balance is NGN 50,000.00. Sending money between Vireo users is completely free, while external bank transfers carry a flat flat fee of NGN 100.00.",
  "toolsExecuted": [
    "get_balance",
    "explain_fee"
  ]
}
```

---

#### POST `/agent/sessions`
Creates an isolated AI session context.

**Response Example (201 Created):**
```json
{
  "id": "11223344-5566-7788-99aa-bbccddeeff00",
  "status": "active",
  "createdAt": "2026-11-14T02:15:00.000Z"
}
```

---

#### GET `/agent/sessions/:id/calls`
Returns the complete audit log of every tool call dispatched within this session.

---

#### POST `/agent/tools`
Dispatches a permitted tool for the agent.

**Available Tools**:
1. `get_balance`: Queries spending power and held funds.
2. `list_transactions`: Queries recent transfers with limit.
3. `validate_recipient`: Looks up user identity by handle, phone, or UUID.
4. `create_transfer_draft`: Creates a draft transfer and signing challenge. **Requires human approval**.
5. `create_payment_request`: Creates an inbound payment request via Paga Collect.
6. `explain_fee`: Returns fee structure for transparent user explanation.

**Request Example (`create_transfer_draft`):**
```json
{
  "sessionId": "11223344-5566-7788-99aa-bbccddeeff00",
  "tool": "create_transfer_draft",
  "input": {
    "amount": "2500.00",
    "deviceId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "recipientHandle": "chidi"
  }
}
```

**Response Example (201 Created):**
```json
{
  "sessionId": "11223344-5566-7788-99aa-bbccddeeff00",
  "tool": "create_transfer_draft",
  "output": {
    "transferId": "f7b11c22-3344-5566-7788-99aabbccdde0",
    "status": "draft",
    "amount": "2500.00",
    "fee": "0.00",
    "recipientName": "Chidi Anagonye",
    "challenge": {
      "id": "a9b8c7d6-e5f4-4321-abcd-ef0123456789",
      "type": "device_key",
      "nonce": "78a9c4b2e1d0f3a5...",
      "payload": {
        "transferId": "f7b11c22-3344-5566-7788-99aabbccdde0",
        "type": "internal",
        "amountMinor": "250000"
      },
      "payloadHash": "c0d1e2f3a4b5c6d7e8f9...",
      "expiresAt": "2026-11-14T02:18:00.000Z"
    },
    "requiresUserApproval": true
  }
}
```

---

### 7. Merchant Services & In-Store Orders

#### POST `/merchants`
Registers a merchant business profile and creates an isolated merchant balance ledger account.

**Request Example:**
```json
{
  "businessName": "Mama Cass Buka",
  "handle": "mamacass",
  "settlementBankCode": "044",
  "settlementAccountNumber": "0123456789"
}
```

**Response Example (201 Created):**
```json
{
  "id": "2d5a3b7c-1122-3344-5566-778899aabbcc",
  "handle": "mamacass",
  "businessName": "Mama Cass Buka",
  "kybStatus": "pending",
  "status": "active",
  "settlementBankCode": "044",
  "settlementAccountNumber": "0123456789",
  "settlementAccountName": null,
  "createdAt": "2026-11-14T02:20:00.000Z"
}
```

---

#### GET `/merchants/dashboard`
Returns live point-of-sale analytics: current balance, today's sales volume, and recent orders.

**Response Example (200 OK):**
```json
{
  "merchant": {
    "id": "2d5a3b7c-1122-3344-5566-778899aabbcc",
    "handle": "mamacass",
    "businessName": "Mama Cass Buka",
    "kybStatus": "verified",
    "status": "active",
    "settlementBankCode": "044",
    "settlementAccountNumber": "0123456789",
    "settlementAccountName": "Mama Cass Buka Ltd",
    "createdAt": "2026-11-14T02:20:00.000Z"
  },
  "balance": {
    "available": "185000.00",
    "held": "0.00",
    "currency": "NGN"
  },
  "salesToday": {
    "amount": "45000.00",
    "count": 12
  },
  "recentOrders": []
}
```

---

#### POST `/merchants/orders`
Creates a till checkout order with an encoded `qrPayload` (`vireo://pay?ref=ord_...`).

**Request Example:**
```json
{
  "amount": "3200.00",
  "note": "Table 4 lunch",
  "expiresInSeconds": 300
}
```

**Response Example (201 Created):**
```json
{
  "id": "99887766-5544-3322-1100-aabbccddeeff",
  "reference": "ord_a1b2c3d4e5f6g7h8",
  "merchantHandle": "mamacass",
  "merchantName": "Mama Cass Buka",
  "amount": "3200.00",
  "currency": "NGN",
  "status": "open",
  "note": "Table 4 lunch",
  "expiresAt": "2026-11-14T02:30:00.000Z",
  "qrPayload": "vireo://pay?ref=ord_a1b2c3d4e5f6g7h8",
  "createdAt": "2026-11-14T02:25:00.000Z"
}
```

---

#### GET `/merchant-orders/:reference`
Enables customer mobile apps scanning a merchant QR code to fetch order details and merchant identity before confirming payment.

**Response Example (200 OK):**
```json
{
  "id": "99887766-5544-3322-1100-aabbccddeeff",
  "reference": "ord_a1b2c3d4e5f6g7h8",
  "merchantHandle": "mamacass",
  "merchantName": "Mama Cass Buka",
  "amount": "3200.00",
  "currency": "NGN",
  "status": "open",
  "note": "Table 4 lunch",
  "expiresAt": "2026-11-14T02:30:00.000Z",
  "qrPayload": "vireo://pay?ref=ord_a1b2c3d4e5f6g7h8",
  "createdAt": "2026-11-14T02:25:00.000Z"
}
```

---

#### POST `/merchants/settlements`
Sweeps merchant balance to their registered bank account via Paga payout rails.

**Request Example:**
```json
{
  "amount": "100000.00"
}
```

**Response Example (201 Created):**
```json
{
  "id": "55667788-99aa-bbcc-ddee-ff0011223344",
  "amount": "100000.00",
  "status": "processing",
  "pagaReference": "PAGA-SETTLE-889977",
  "failureReason": null,
  "createdAt": "2026-11-14T02:35:00.000Z",
  "updatedAt": "2026-11-14T02:35:02.000Z"
}
```

---

### 8. Webhooks (Paga Callback Receiver)

#### POST `/webhooks/paga`
Inbound webhook handler for Paga events, backed by a **BullMQ Redis Queue** for guaranteed, asynchronous background processing:
1. Immediately enqueues the inbound event payload into the `webhooks` BullMQ queue and responds `200 OK` with `{ status: "queued", jobId }`.
2. The background `WebhookProcessor` processes the job:
   - Cryptographically verifies the HMAC/SHA-512 callback signature against `PAGA_HASH_KEY`.
   - Deduplicates identical event IDs using PostgreSQL unique constraints.
   - Posts balanced double-entry transactions (inbound deposits credit user wallets, payout callbacks resolve holds).
   - Dispatches real-time email notifications via Resend.

- **Authentication**: Validated asynchronously by the worker via `x-paga-hash` header or `hash` parameter in payload matching `PAGA_HASH_KEY`.
- **Idempotency**: Automatic deduplication via event notification IDs.

**Deposit Notification Request Example:**
```json
{
  "notificationId": "NOTIF-20261114-001",
  "statusCode": "0",
  "accountNumber": "9912345678",
  "amount": "25000.00",
  "clearingFeeAmount": "0.00",
  "transferFeeAmount": "0.00",
  "externalReferenceNumber": "DEP-PAGA-091283",
  "customerName": "Oluwaseun Adeyemi",
  "hash": "computed-sha512-hash-with-hashKey"
}
```

**Response Example (200 OK — Enqueued in BullMQ):**
```json
{
  "status": "queued",
  "jobId": "1"
}
```

---

### 9. Internal Operations & Reconciliation

#### POST `/internal/reconciliation/run`
Triggered by scheduled cron workers or operations scripts to check pending bank payout statuses against Paga and reconcile the double-entry ledger.

- **Authentication**: Protected by `x-internal-token: <INTERNAL_API_TOKEN>`.

**Response Example (200 OK):**
```json
{
  "pendingChecked": 3,
  "results": [
    {
      "id": "d2f8a1c6-5b42-4291-ce31-1e4b88911102",
      "providerStatus": "completed"
    }
  ],
  "failedEvents": 0
}
```

---

## Error Handling & HTTP Status Codes

The API returns standard RFC 7807 compliant JSON error responses:

```json
{
  "statusCode": 400,
  "message": ["amount must be a positive decimal with up to 2 places"],
  "error": "Bad Request"
}
```

| HTTP Status | Meaning | Typical Scenario |
| :--- | :--- | :--- |
| `200 OK` | Request succeeded | Retrieval or update operation completed. |
| `201 Created` | Resource created | User registered, draft created, order created. |
| `400 Bad Request` | Validation or business constraint failed | Insufficient balance, invalid OTP, invalid phone format. |
| `401 Unauthorized` | Missing or invalid authentication | Missing JWT token, invalid device signature, invalid Paga hash. |
| `403 Forbidden` | Access denied | Accessing a resource or challenge belonging to another user. |
| `404 Not Found` | Resource not found | User not registered, unknown transfer, missing order. |
| `409 Conflict` | Unique constraint violated | Idempotency key reused by another user, merchant handle taken. |
| `500 Server Error` | Unexpected backend error | Upstream payment provider or database network failure. |
