# ARCHITECTURE.md — Structural Blueprint

This document defines the structural design of the system: the separation of concerns between frontend and backend, the multi-tenancy data model, and the Bring Your Own Key (BYOK) pattern for API credentials.

## Frontend / Backend Separation

The system maintains a strict boundary between the visual frontend application and the backend server layer.

- **Frontend (client):** Next.js App Router pages, layouts, and client components. Responsible only for presentation, user interaction, and calling backend logic through Server Actions or route handlers. The frontend never talks to Supabase, third-party LLM APIs, or any secret-bearing service directly.
- **Backend (server):** Next.js Server Actions and server-only modules. Responsible for all database access, authentication checks (via Clerk), API-key handling, LLM calls, and business logic. All secrets, service-role keys, and encrypted credentials live and are used only on the server.

Rule: no Supabase client with elevated privileges, no decrypted API key, and no LLM request may ever be constructed in client-side code.

## Multi-Tenancy Isolation

The database is designed for **absolute multi-tenant isolation**. Every table — without exception — must include a required `tenant_id` column.

This applies to (including but not limited to):

| Table | Notes |
|---|---|
| `clients` | `tenant_id` required, indexed |
| `analytics` | `tenant_id` required, indexed |
| `encrypted_api_keys` | `tenant_id` required, indexed |
| `ai_logs` | `tenant_id` required, indexed |
| Any future table | `tenant_id` required, indexed |

Enforcement rules:
- `tenant_id` is `NOT NULL` on every table — no nullable escape hatch.
- Every query must be scoped by `tenant_id`, either via application-layer filtering or Supabase Row-Level Security (RLS) policies keyed on `tenant_id`.
- No cross-tenant query is permitted, including for admin/reporting features — those must aggregate through tenant-scoped views, not raw cross-tenant scans.

## Bring Your Own Key (BYOK) Pattern

Users supply and are billed through their own upstream developer account credentials (e.g. their own LLM provider API key), rather than the platform absorbing usage cost.

### `encrypted_api_keys` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `tenant_id` | uuid | required, FK to tenant |
| `provider` | varchar | e.g. `anthropic`, `openai` |
| `encrypted_key` | text | encrypted at rest, never stored in plaintext |
| `encryption_iv` | text | initialization vector for decryption |
| `created_at` | timestamp | |
| `last_used_at` | timestamp | nullable |

### Server-side validation requirements

- API keys are decrypted **only** in server-side code, only at the moment of use, and never logged or returned to the client in decrypted form.
- Before any provider request is made, the backend must verify the decrypted key belongs to the requesting tenant (`tenant_id` match) — a key must never be usable outside the tenant that owns it.
- All token/usage transactions from a request must be attributed to and charged against the tenant's own key/account — the platform's own credentials must never be substituted as a fallback, silently or otherwise.
- Key decryption failures or provider auth failures must be caught and logged (see `ai_logs`) rather than causing silent fallthrough.
