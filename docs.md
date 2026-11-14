# Vireo Finance: Product Requirements Document

Version 0.1 (Draft) | November 14, 2026 | Status: MVP planning

## 1. Overview

Vireo Finance is a banking product for Nigeria, built on the Paga payments engine, with two sides:

1. **Vireo Personal:** agentic personal banking. Users manage money by talking to an AI agent, and every movement of money is approved with the phone's own biometrics.
2. **Vireo Merchant (Device-less & Biometric Extremes):** merchant banking where customers pay with face and voice biometrics, with no phone, card, or wallet needed at the till.

Both sides share one ledger, one Paga integration, one KYC system, and one fraud engine.

## 2. Problem Statement

- Everyday banking apps are menu-heavy. Simple intents ("send 20k to Ada", "how much did I spend on food?") take many taps.
- Some people cannot easily handle devices, cards, or PINs, or do not want to carry anything. Cash and cards fail them at the point of sale.
- Merchants lose sales and time to failed card and transfer payments, and wait on settlement.
- Biometric and AI-driven finance products are risky if built carelessly: spoofing, deepfakes, prompt injection, and regulatory exposure.

## 3. Vision and Goals

**Vision:** money that responds to you, not to your devices.

**Goals**

- G1: Let a user send, receive, and pay in a few seconds, with an agent handling the steps.
- G2: Let a merchant accept payment from a customer using only their face and voice.
- G3: Keep every payment cryptographically authorized by the user, so neither the agent nor a spoofed biometric alone can move money.
- G4: Operate within Nigerian payments, KYC, and data protection requirements.

**Non-goals (for v1)**

- Lending, credit scoring, savings products, and investments.
- International transfers and multi-currency.
- Building our own face or voice biometric models from scratch for production.
- Fully autonomous agent payments with no user approval.

## 4. Target Users

| Persona | Description | Key need |
| --- | --- | --- |
| Everyday user | Smartphone owner who wants fast, simple banking | Send, receive, and pay with minimal effort |
| Device-averse customer | Elderly, low-literacy, or no-device users | Pay without a phone or card |
| Small merchant | Shop, market stall, kiosk, or restaurant | Fast, reliable payments and settlement |
| Merchant staff | Cashier operating the till | Simple flow that works in a queue |
| Operations / compliance | Internal team | Monitoring, disputes, audit |

## 5. Product Scope

### 5.1 Vireo Personal (agentic banking)

| Feature | Priority |
| --- | --- |
| Onboarding with KYC and phone biometric enrollment | MVP |
| Wallet with dedicated virtual account number | MVP |
| Send to Vireo users, bank accounts, and Paga wallets | MVP |
| Receive from any bank or mobile money app | MVP |
| Transaction history and receipts | MVP |
| Conversational agent (balance, history, send drafts, requests) | MVP |
| Payment requests | MVP |
| Bill payments, airtime, and data via agent | Phase 2 |
| Spending insights and categories | Phase 2 |
| Scheduled and recurring payments | Phase 2 |
| Voice as a step-up check for high-value transfers | Phase 2 |

### 5.2 Vireo Merchant (Device-less & Biometric Extremes)

| Feature | Priority |
| --- | --- |
| Merchant onboarding, KYB, and settlement account | MVP |
| Merchant app: create payment request, show QR | MVP |
| QR payment from a Vireo Personal customer | MVP |
| Merchant dashboard: sales, balance, settlement | MVP |
| Settlement to bank (automatic and on-demand) | MVP |
| Customer biometric enrollment (face + voice) with consent | Phase 3 |
| Face + voice payment at the till | Phase 3 |
| Step-up challenge (random phrase or PIN) for large amounts | Phase 3 |
| Offline and degraded-mode handling | Phase 3 |

The MVP proves the ledger, Paga flows, and merchant experience using phone-approved QR payments. Face and voice payment is added after those are stable.

## 6. Key User Flows

### 6.1 Sending money

**To another Vireo user (internal)**

1. User gives the recipient's phone number or handle, and the app shows the recipient's name.
2. Backend checks balance and limits, then creates a challenge (amount, recipient, nonce, expiry).
3. Phone biometric unlocks the device key, which signs the challenge.
4. For large amounts or new payees, a voice phrase is also required (Phase 2).
5. Backend verifies the signature and writes the ledger entry in one database transaction.
6. Both parties are notified. No Paga call is needed.

**To a bank account (external)**

1. User picks a bank and enters the account number. Backend calls Paga validate-deposit and shows the account holder's name and the fee.
2. User confirms, and the challenge, biometric signature, and optional step-up run.
3. Backend reserves the amount plus fee and marks the transfer pending.
4. Backend calls Paga deposit-to-bank with a unique reference.
5. On success, mark complete. On failure, release the reserve. If the result is unclear, check status by reference before any retry.

### 6.2 Receiving money

- **From a Vireo user:** ledger credit and notification.
- **From any bank or mobile money app:** the sender transfers to the user's dedicated virtual account number. Paga sends a webhook, the backend verifies it, checks for duplicates, credits the ledger, and notifies the user.
- **Payment request:** user creates a request, the payer is notified, and fulfilment triggers the credit flow.
- Daily reconciliation against Paga reports covers missed or delayed webhooks.

### 6.3 Paying a merchant

1. Merchant enters the amount and the app shows a QR code.
2. Customer scans it and sees the merchant name and amount.
3. Challenge, biometric signature, and optional step-up run.
4. Backend debits the customer and credits the merchant in one transaction.
5. Both sides see confirmation and a receipt.
6. Merchant settles to their bank on a schedule or on request.

### 6.4 Face + voice payment at the till (Phase 3)

1. Customer identifies themselves (phone number or handle) at the terminal. 1:1 matching comes first; 1:N search is a later option.
2. Terminal captures face and a random spoken phrase.
3. Biometric service returns liveness scores, a face match score, a voice match score, and a spoof score.
4. Score fusion decides approve, deny, or step-up.
5. On approve, the same ledger transaction as the QR flow runs.

## 7. Agentic Banking Requirements

- **The agent proposes, the user approves.** The agent can create transfer drafts but cannot sign or execute payments. The device key, unlocked by the user's biometric, is the only way to authorize.
- **Narrow tools only:** get balance, list transactions, validate recipient, create transfer draft, create payment request, explain a fee. No tool can move money directly.
- **Clear confirmation screen** showing exact amount, recipient name, and fee before signing, rendered by the app and not by the agent.
- **Spending limits and payee allowlists** apply to agent-created drafts, with a cooling-off period for new payees.
- **Prompt-injection defenses:** treat transaction narrations, names, and merchant text as untrusted data, never as instructions.
- **Audit trail:** log every agent tool call, the user's request, and the approval result.
- **Graceful failure:** when the agent is unsure of a name or amount, it asks and does not guess.

## 8. Biometric Requirements

### 8.1 Personal (phone biometrics)

- Key pair generated in the phone's secure hardware (Secure Enclave or Keystore), protected by biometrics. The public key is registered with the backend.
- Each transaction is a signed challenge that includes amount, recipient, nonce, and expiry.
- Keys are invalidated when new biometrics are enrolled on the device.
- Device attestation (Play Integrity, App Attest) to detect rooted or fake devices.
- Recovery: re-KYC then register a new device key. Lost devices can be revoked.
- Libraries that return only a true/false biometric result are not used for authorization.

### 8.2 Merchant (face + voice)

- Use certified liveness and anti-spoofing vendors where possible, and require third-party test evidence (for example iBeta presentation attack detection results), tested on our own terminal hardware.
- Defend against injection attacks, not just physical spoofs.
- Voice: speaker verification plus anti-spoofing plus a random phrase challenge. Open-source models are acceptable for the MVP experiments, but real money needs a vendor with deepfake and clone detection.
- Store embeddings only, encrypted, with key management. Delete raw audio and images after processing.
- Explicit, auditable consent and a deletion path.
- Accuracy testing across skin tones, ages, genders, accents, and noisy environments before launch.

## 9. System Architecture (high level)

- **Backend:** TypeScript on NestJS.
- **Database:** PostgreSQL with a double-entry ledger as the source of truth.
- **Queues and jobs:** Redis with BullMQ for webhooks, retries, settlement, and reconciliation.
- **Payments engine:** Paga Business API (payouts, transfers) and Collect API (virtual accounts, payment requests, webhooks).
- **Mobile:** React Native app for Personal and Merchant, using key-signing biometrics.
- **Agent service:** LLM with a restricted tool layer that calls backend APIs.
- **Voice service (Phase 2+):** Python service for speaker and spoof models.
- **Biometric vendors (Phase 3):** liveness and matching via a certified provider.
- **Risk engine:** limits, velocity checks, new payee and new device rules, anomaly flags.
- **Observability:** audit logs, metrics, alerts, and an admin console.

**Core rules:** ledger first and Paga second; idempotency keys on every money request; one database transaction for internal moves; one-time nonces and short challenge expiry; request signing for all Paga calls with secrets held server-side only.

## 10. Data Model (summary)

- Users, devices (public keys, attestation state), KYC records
- Accounts and virtual accounts
- Ledger entries (double-entry), balances, holds/reserves
- Transfers (state: draft, pending, completed, failed, reversed)
- Payment requests and merchant orders
- Merchants, terminals, settlements
- Challenges (nonce, expiry, payload hash)
- Biometric enrollments (embeddings, consent records)
- Agent sessions and tool-call audit logs
- Disputes and refunds

## 11. Security and Risk Controls

- Biometric templates and embeddings encrypted at rest, with KMS or HSM key management.
- Transaction limits by user tier, device age, and payee age; step-up for high value.
- Replay protection through nonces and expiry; signed payloads bound to amount and recipient.
- Fraud monitoring and the ability to freeze an account or device.
- Penetration testing and a written threat model before launch.
- Incident response plan, including a biometric-breach plan (biometrics cannot be reset, so cancelable templates and re-enrollment must be supported).

## 12. Compliance and Legal (to confirm)

- Whether our model (pooled Paga balance, customer balances in our ledger) is permitted under our Paga agreement or requires our own CBN license.
- KYC and AML obligations, and which tiers and limits apply.
- Nigeria data protection law for biometric data: lawful basis, consent, retention, and breach notification.
- Card and PCI-DSS scope if card funding is ever added.
- Dispute and liability policy, including false biometric matches and agent errors.

## 13. Success Metrics

| Area | Metric |
| --- | --- |
| Adoption | Activated users, merchants onboarded |
| Engagement | Weekly active users, payments per user |
| Agent | Share of transfers started via agent, draft-to-approval rate, agent error rate |
| Payments | Success rate, median time to confirm, failed or stuck payouts |
| Merchant | Settlement time, share of sales on Vireo |
| Biometrics (Phase 3) | False accept rate, false reject rate, spoof attempts blocked |
| Trust | Fraud loss rate, dispute rate, chargeback and reversal rate |

## 14. Roadmap (suggested)

**Phase 1: Core and Personal MVP** Ledger, Paga send and receive, KYC, phone-signed approvals, basic agent, notifications.

**Phase 2: Merchant MVP and agent depth** Merchant app and dashboard, QR payments, settlement, bills and airtime via agent, voice step-up.

**Phase 3: Device-less & Biometric Extremes** Customer face and voice enrollment, terminal capture, liveness and matching, score fusion, offline handling, limited pilot with a small set of merchants.

**Phase 4: Scale** Hardening, accuracy audits, 1:N matching evaluation, more rails, additional merchant categories.

Timelines to be set after the compliance and Paga questions in sections 12 and 15 are resolved.

## 15. Risks and Open Questions

| Risk or question | Mitigation or next step |
| --- | --- |
| Deepfake and voice-clone fraud | Certified liveness, random challenges, step-up, low limits at launch |
| Regulatory pushback on biometric-only authentication | Pair biometrics with step-up and limits, engage regulators early |
| Paga agreement and licensing model | Confirm with Paga partnerships and legal counsel before building on pooled balances |
| Agent mistakes or manipulation | Draft-only agent, signed approvals, injection defenses, audit logs |
| Webhook or payout failures | Idempotency, status checks, reconciliation jobs |
| Biometric bias and noisy environments | Test across demographics and real merchant conditions |
| Terminal hardware and connectivity | Pilot hardware selection, offline fallback design |
| Account recovery without losing security | Re-KYC plus new device key, rate limits, human review for edge cases |

**Open questions**

1. Does Paga support per-user wallets, and what are the exact fees and limits on virtual accounts and payouts?
2. Which liveness and voice vendors are available and priced for the Nigerian market?
3. What transaction limits per KYC tier at launch?
4. Which LLM and hosting setup for the agent, given latency and cost?
5. Which merchant segments to pilot first?