<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-light.png">
    <img src="docs/assets/logo.png" alt="Vireo Finance" width="320">
  </picture>
</p>

# Vireo Finance

> Banking for Nigeria that you talk to, with a till that recognises your face.

Vireo Finance is built on the [Paga](https://www.paga.com) payments engine. It has two sides that share one ledger, one KYC system and one fraud engine:

- **Vireo Personal:** a wallet you manage by chatting with an AI assistant. The assistant can prepare a payment, but it can never send one. Every payment is approved on your phone with biometrics or a 4-digit PIN.
- **Vireo Merchant:** a merchant dashboard that accepts payments by QR code, by bank transfer to a dedicated deposit account, or by face at the till, then settles to the merchant's bank.

> **Status:** hackathon MVP ([`0.3.0`](CHANGELOG.md#030---2026-11-18)). Identity checks run against Didit's sandbox until a live key is configured, see [Verification modes](#verification-modes).

## Table of contents

- [Features](#features)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Verification modes](#verification-modes)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Security](#security)
- [Contributing](#contributing)
- [Contact](#contact)
- [License](#license)

## Features

This is the current feature set. For what shipped in each version, see the [changelog](CHANGELOG.md).

**Personal**
- Wallet with a dedicated account number (a Paga virtual account) that anyone can pay into from any bank.
- AI assistant that checks balances, shows activity, explains fees, shows your deposit account and prepares bank transfers. It resolves banks and recipients on the server.
- Payment approval with device biometrics (Ed25519 device key) or a transaction PIN, always checked on the server.
- Transfers to other Vireo users are settled internally; transfers to other banks go through Paga.
- Sign-in with a 6-digit code emailed to you (no passwords, no SMS). The phone number is saved on your profile only.
- Tiered KYC (BVN, then NIN and ID, then proof of address) with balance limits that rise with each tier.
- Activity feed, receipts, in-app notifications.

**Merchant**
- Business registration and verification (including CAC).
- QR payment requests and a deposit account for bank transfers.
- Face payment at the till (see [backend/DEVICELESS_PAYMENTS.md](backend/DEVICELESS_PAYMENTS.md)).
- Settlement to a bank account, confirmed with biometrics or PIN.
- Combined activity feed of sales, deposits and settlements.

## Repository layout

| Folder | What it is | Stack |
| --- | --- | --- |
| [backend/](backend) | REST API, ledger, Paga integration, KYC, assistant | NestJS 11, TypeORM, PostgreSQL, Redis (BullMQ) |
| [personal/](personal) | Personal app (iOS, Android, web) | Expo, React Native, TypeScript |
| [merchant/](merchant) | Merchant app (iOS, Android, web) | Expo, React Native, TypeScript |
| [landing/](landing) | Marketing site | Vite, React |
| [docs/](docs) | Product requirements, API reference, Postman collection | Markdown, JSON |

## Architecture

```
 Personal app ─┐                        ┌─ Paga (payments, virtual accounts)
 Merchant app ─┼─ HTTPS ─▶ NestJS API ──┼─ Didit (face, BVN, NIN, documents)
               │          │   │         ├─ Backblaze B2 (encrypted documents)
               │          │   │         └─ OpenAI (assistant)
               │          ▼   ▼
               │      PostgreSQL  Redis
               │      (ledger)    (queues)
```

The API is versioned under `/api/v1`. Money is stored as integer minor units in a double-entry ledger. Payment actions use one-time challenges that the user's device key signs.

## Getting started

**Requirements:** Node.js 22+, pnpm 11 (backend), npm (apps), PostgreSQL, Redis.

### Backend

```bash
cd backend
pnpm install
cp .env.example .env      # then fill in the values, see Configuration
pnpm migration:run        # create the database schema
pnpm start:dev            # http://localhost:3050/api/v1
```

### Apps

```bash
cd personal               # or: cd merchant
npm install
EXPO_PUBLIC_API_BASE_URL=http://localhost:3050/api/v1 npm run web   # personal :8081, merchant :8082
```

Use `npm run ios` or `npm run android` for a device or simulator.

### Local test money

To credit a local wallet without a real bank transfer, send the backend the signed callback Paga would send:

```bash
cd backend
pnpm fund:test <accountNumber> [amountNaira]
```

This only works against `localhost` and only credits your local database.

## Configuration

All backend settings are environment variables. [backend/.env.example](backend/.env.example) lists every one with a comment. The ones you need first:

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` | PostgreSQL connection. A hosted database needs its **external** hostname and `DB_SSL=true`. |
| `JWT_SECRET` | Signs session tokens. |
| `PIN_PEPPER` | Secret for hashing transaction PINs. Required, at least 32 characters, different from `JWT_SECRET`. |
| `PAGA_API_KEY`, `PAGA_API_SECRET`, `PAGA_HASH_KEY` | Paga credentials. Your server's IP must be whitelisted by Paga. |
| `BIOMETRIC_PROVIDER`, `DIDIT_API_KEY`, `DIDIT_KEY_TYPE` | Face and identity checks (`sandbox` or `live`). |
| `BIOMETRIC_ENCRYPTION_KEY`, `KYC_ENCRYPTION_KEY`, `DOCUMENT_ENCRYPTION_KEY` | Encrypt face references, BVNs and documents at rest. Back them up: losing one makes the data unreadable. |
| `DOCUMENT_STORAGE`, `B2_*` | Backblaze B2 storage for uploaded documents. |
| `OPENAI_API_KEY` | Enables the assistant. Leave empty to disable it. |

The apps read one public value, `EXPO_PUBLIC_API_BASE_URL`, at build time. Never put secrets in it. Keep real `.env` files out of git (they are ignored).

## Verification modes

The server starts with either Didit key type and logs the mode at startup:

- `Didit mode: LIVE` — identity and face checks are real.
- `Didit mode: SANDBOX` — Didit approves every check, so verification proves nothing. Use it for demos and testing with test money only.

Other switches that write sensitive data to the logs (`OTP_LOG_CODE`, `LOG_HTTP_BODIES`, `LOG_LLM_PAYLOADS`) are allowed, and each one that is on produces a warning at startup. Turn them off once you no longer need to read sign-in codes or request details in the logs.

## Testing

```bash
cd backend
pnpm typecheck && pnpm lint && pnpm test && pnpm build
cd ../personal && npm run typecheck     # same for merchant
```

## Deployment

- **Backend:** GitHub Actions ([.github/workflows/deploy.yaml](.github/workflows/deploy.yaml)) type-checks, tests and builds, then on `main` copies the build to the server over SSH, installs production dependencies, runs migrations and restarts PM2. It needs the repo secrets `VPS_SSH_KEY`, `VPS_HOST` and `VPS_USER`, and a `.env` on the server. A reverse proxy such as nginx fronts the API with HTTPS.
- **Apps:** each web app is a static site. Build it from `personal/` or `merchant/` with `npx expo export --platform web` and serve the `dist/` folder from any static host. Route every path to `index.html` so a page refresh works, and serve it over HTTPS (the camera and QR scanner need it). Set `EXPO_PUBLIC_API_BASE_URL` to your API's `/api/v1` URL when you build, because the value is compiled into the bundle.

More detail: [backend/DEPLOYMENT.md](backend/DEPLOYMENT.md) and [backend/SETUP_DATABASE.md](backend/SETUP_DATABASE.md).

## Documentation

- [Product requirements](docs/Vireo%20Finance%20Product%20Requirements%20Document.md)
- [API reference](docs/API_DOCUMENTATION.md) and [Postman collection](docs/vireo_finance.postman_collection.json)
- [Face payments](backend/DEVICELESS_PAYMENTS.md)
- [Changelog](CHANGELOG.md): what changed in each version

## Security

- Input is validated and bounded; every action is authorised on the server.
- BVN, NIN, PIN, selfies and documents are never stored on the device or written to logs. Documents and face references are encrypted before storage.
- PINs are hashed with a server secret and lock out after repeated failures.
- The assistant cannot move money. It can only prepare a draft that the user approves.

Please report vulnerabilities privately to [info@vireofinance.app](mailto:info@vireofinance.app) rather than in a public issue.

## Contributing

1. Branch from `dev` and keep changes focused.
2. Use [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `ci:`).
3. Before opening a pull request, run the checks in [Testing](#testing).
4. Add an entry under `Unreleased` in [CHANGELOG.md](CHANGELOG.md).

## Contact

Questions, partnerships or permission requests: [info@vireofinance.app](mailto:info@vireofinance.app).

## License

Copyright (c) 2026 Vireo Finance. All rights reserved.

This codebase is the property of Vireo Finance. It is proprietary software and may not be used, copied, modified or distributed without written permission. See [LICENSE](LICENSE) for the full notice.
