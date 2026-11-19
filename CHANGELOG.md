# Changelog

All notable changes to Vireo Finance are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions `0.1.0` to `0.3.0` were cut retroactively from the commit history of the hackathon build (14 to 18 November 2026).

## [Unreleased]

### Added
- `README.md`, this changelog and a `LICENSE` stating that the codebase is the property of Vireo Finance.
- Email sign-in codes for both apps, with the PIN-reset code also sent by email (`POST /pin/reset/code`). Codes can be requested once every 30 seconds per email.
- Tests for the email-code login, the PIN-reset code and registration.

### Changed
- Sign-up in both apps now asks for first name, last name, email and phone; sign-in asks for the email only. Phone numbers are saved on the profile and never receive a code.
- `POST /auth/register` requires an `email` and a `phone` (a password is optional). A phone number already used by another account is refused.

### Removed
- Phone one-time-code login (`POST /auth/otp/request` and `/auth/otp/verify`), because codes now go to email only.

### Fixed
- Mobile layout: decorative glows behind every screen made the page scroll sideways on phones. The screen frame now clips them (both apps).
- Merchant "Pay with face": a recognised face was reported as "Payment received" although nothing is charged. It now says the customer was recognised and no payment was taken.
- The CI test suite failed after the email-code login was added, because its test setup lacked the new dependencies.

## [0.3.0] - 2026-11-18

Deposit accounts, a redesigned and more capable assistant, internal transfers, a unified activity feed, face identification at the till, the marketing site, and the first CI/CD pipeline.

### Added

**Accounts and payments**
- Personal deposit account: every user gets a dedicated Paga virtual account on demand, shown on Home and in the assistant (`POST /accounts/me/deposit-account`). Merchants get the same for receiving transfers.
- Internal routing: a transfer to another Vireo account number settles on the internal ledger instead of going out through Paga, and the recipient is notified.
- Bank transfers prepared by the assistant (`create_bank_transfer_draft`). The bank is resolved on the server and a draft is only ever approved by the user.
- Bank lookup with account-name resolution and rate limiting, and a bank picker that lists every bank.
- Unified activity feed shared by the personal wallet and the merchant app (`GET /merchants/me/activity`), so merchant credits now show up in Activity.
- `pnpm fund:test`: credits a local wallet by sending the backend the signed callback Paga would send (localhost only).

**Assistant**
- `get_deposit_account` tool: "how do I fund my account?" now returns the user's own account number as a card with a Copy button instead of asking transfer questions.
- Redesigned chat: animated green background, glass composer with suggestion chips, multi-line input that grows and shrinks, Enter to send and Shift+Enter for a new line on web.
- Markdown (asterisks, headings, bullets) is stripped from replies before they are shown.

**Apps**
- New card components: balance card, account-number card, glass account card for the chat, frosted receipt, and a transaction popup that rises from the bottom.
- App-wide pull-to-refresh and persisted navigation and form state, so a page reload keeps you where you were.
- New brand assets, logo and favicons for both apps.
- Notification scoping (`personal` or `merchant`) with an inbox banner in each app, so a notification only shows in the app it belongs to.
- Inbox, transaction PIN setup during onboarding and in the app, and a "Verify identity" flow that hides once verification is done.
- Vercel configuration for the personal and merchant web apps (`vercel.json`, `.env.example`).

**Face payments**
- True device-less payment: 1:N face identification at the till, where the customer only shows their face (`identifyByFace`, `BiometricPaymentScreen` mode selector). The 1:1 verification path is kept as a legacy mode. See `backend/DEVICELESS_PAYMENTS.md`.

**Authentication**
- Email and password registration and login alongside phone one-time-code login, plus welcome notification, Paga customer registration at sign-up, and Apple and Google device attestation.
- Migrations `AddPasswordAndEmailIndex` and `AllowEmailOnlyUsers` so several accounts can exist without a phone number.

**Landing site**
- `landing/`: Vite and React marketing site with personal and merchant pages, glass-morphism design and deployment notes.

**Operations**
- GitHub Actions workflow (`.github/workflows/deploy.yaml`): type-check, test and build on every push; on `main`, copies the build to the VPS over SSH, installs production dependencies, runs migrations and restarts PM2 (`backend/ecosystem.config.js`).
- Dockerfile, `docker-compose.yml` and Railway, Fly.io and Render configuration, with `CICD_QUICKSTART.md` and deployment helper scripts.
- The server logs whether Didit runs in `SANDBOX` or `LIVE` mode at startup, and warns for each logging switch that is on.

### Changed
- Starting in production with a Didit sandbox key, or with `OTP_LOG_CODE`, `LOG_HTTP_BODIES` or `LOG_LLM_PAYLOADS` on, is now allowed. The server warns at startup instead of refusing to start.
- Merchant verification only needs BVN verification (Level 1). The payout account name is checked at settlement time, not during KYC.
- Paga virtual accounts are created in the owner's real name instead of the business name.
- Bank ids use a loose pattern (`BANK_ID_PATTERN`) because Paga's own bank id is not a standard UUID.
- Registration accepts a phone number, an email with a password, or both.

### Fixed
- Paga Collect requests returned HTTP 500 "system error": Node's default `Accept-Language: *` was the cause, so every request now sends `Accept-Language: en`.
- Bank ids rejected by strict UUID validation, and transfer and settlement bank-code columns too short for a 36-character id (migrations `FixSettlementBankCodeLength`, `FixTransferBankCodeLength`).
- Bank picker showing only about ten banks.
- Debug logging that exposed a BVN and the Paga API secret was removed, and redaction now covers BVN, NIN, selfies and PIN.
- BVN checks passing on a partial name match: every field must now be a full match.
- Stale PIN and biometric status after returning from the PIN screen.
- Chat input showing a large empty box and not shrinking after deleting lines.
- Merge of `main` into `dev` broke `auth.service.ts`: the one-time-code login, admin bootstrap and PIN reset were restored beside the email login and device attestation. The reconciliation queue registration was restored and unused imports removed.

### Removed
- The earlier per-platform deploy workflows (`backend-ci.yml`, `backend-deploy.yml`, `backend-docker.yml`), replaced by `deploy.yaml`.

## [0.2.0] - 2026-11-17

Biometrics, identity verification, tiered KYC, document storage, the transaction PIN, and web support for both apps.

### Added

**Biometrics**
- Biometrics module: consent, enrolment and verification services, encrypted enrolment storage, an attempt audit log, and a score-fusion check combining match, liveness and spoof scores (migration `AddBiometricTables`).
- Terminal payment endpoint for device-less payments, with a step-up challenge for high-value transactions.
- Personal app `BiometricEnrollScreen` and merchant app `BiometricPaymentScreen`, built on the camera and a face-guide overlay.
- Didit as the single verification provider: configuration, startup validation, a provider adapter and unit tests.
- Face-only biometrics: earlier voice templates were revoked (migration `RevokeLegacyBiometricTemplates`).
- `PHASE3_*` documentation, a Postman collection and `test-biometrics.sh` for the biometric endpoints.

**KYC and verification**
- BVN verification through Didit, then NIN with ID document and proof of address, in tiers that raise the balance limit (`tiers.ts`). Balances above a tier's cap are held in the ledger until the user upgrades.
- Merchant registration with CAC and TIN, business levels, merchant cash-out limits per level, and automatic merchant verification.
- Identity checks never store or log BVN, NIN or selfies; identities are encrypted at rest (migration `CreateKycIdentities`).

**Documents**
- Document storage with Backblaze B2, where the backend acts as a proxy and encrypts files with AES-256-GCM before upload, so the storage location is never exposed to the apps (migrations `CreateDocuments`, `AddMerchantCacDocument`).

**Transaction PIN**
- Server-side 4-digit transaction PIN with a secret pepper, lockout after repeated failures, OTP-based reset, and PIN fallback wherever biometrics approve a payment, including settlements (migration `CreateUserPins`).

**Merchant**
- Merchant deposit account, in-app notifications (inbox, `InAppNotificationProvider`), a Verify screen and re-check endpoint.
- Settlement drafts bound to a device challenge, with a hold reserved while the draft is open, and payout through Paga on approval (migration extends the settlement status enum).
- Edit business details, and an admin screen for staff to review KYC and KYB submissions.

**Apps**
- Web support for both Expo apps with a custom storage module and a cross-platform alert dialog.
- Landing screens, a motion library (fade, rise, float, glow and more), a darker theme with green accents, and responsive text sizing.
- QR scanning on the Pay screen and bank lookup with a bank picker.
- "Ask Vireo" assistant chat and an admin review queue in the profile.

**Backend**
- HTTP request logging with sensitive-data redaction, optional body and LLM payload logging, and verified TLS for the database (`DB_SSL`, `DB_SSL_CA`).
- Backend deployment guide and local development guide.

### Changed
- Tier names and KYC status display (`not started` and `pending` are now different states).
- Insufficient-wallet-balance errors from Paga are handled and reported clearly.

## [0.1.0] - 2026-11-14

Foundation: the backend, both mobile apps and the first KYC and assistant modules.

### Added
- NestJS backend with TypeORM and PostgreSQL: users, accounts, a double-entry ledger, transfers, devices with Ed25519 signed challenges, and a risk engine with transfer limits.
- Paga integration for virtual accounts, bank transfers and webhooks, with hash verification.
- Redis and BullMQ queues, and a reconciliation job that runs every five minutes.
- KYC module: submit, admin approve or reject, and a status endpoint.
- Notification providers (logger, SMS, push) enabled by configuration.
- AI banking assistant endpoint with tool execution (first on Gemini, then switched to OpenAI).
- Email and password authentication documentation, API reference and a Postman collection.
- Personal app (Expo, React Native, TypeScript): register, OTP verify, wallet balance and transactions, send with a device signature, KYC.
- Merchant app: onboarding with settlement bank details, dashboard, QR payment requests, orders list and settlement.

[Unreleased]: https://github.com/icekidtech/vireo-finance/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/icekidtech/vireo-finance/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/icekidtech/vireo-finance/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/icekidtech/vireo-finance/releases/tag/v0.1.0
