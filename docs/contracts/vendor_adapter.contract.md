# Vendor Adapter (Multi-Vendor Registry)

**Contract Version:** 0.1.0
**Owner Agent(s):** Crius (multi-vendor adapter registry authority, AES-256-GCM envelope encryption, pybreaker circuit breaker, Tenacity retry chain, ordered fallback)
**Consumer Agent(s):** Kratos (model routing fallback per `agent_orchestration_runtime.contract.md`; Anthropic-first runtime anti-pattern 7 honored, Crius is the exception slot for user-visible fallback), Hyperion (embedding API fallback OpenAI → Voyage), Aether (vendor_adapter_config tables + RLS), Hemera (per-vendor kill-switch flags), Selene (OTel trace per vendor call), Eunomia (admin vendor config UI), Nemea-RV-v2 (circuit breaker regression), Boreas (chat UIScene visible model selector via ModelSelector component)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the multi-vendor LLM adapter registry that bridges NERIUM Protocol pillar from P0 Proteus IR schema to NP production-grade per-record API key envelope encryption + circuit breaker + Tenacity retry + ordered vendor fallback chain. Vendors supported: Anthropic (primary per `CLAUDE.md` anti-pattern 7), OpenAI (user-visible fallback only via ModelSelector), local vLLM (future, post-hackathon stub).

**Anti-pattern 7 boundary**: vendor fallback triggers only when user explicitly opts in via ModelSelector UI. Default session runtime always Anthropic. No automatic cross-vendor routing. Embedding API is the exception slot where Crius transparently falls back between Voyage (Anthropic-affiliated) and OpenAI `text-embedding-3-small` per `marketplace_search.contract.md` degraded-mode tolerance.

Scope distinct from `vendor_adapter_ui.contract.md` P0 which was UI-only for dialog visualization mockup.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 3 Builder flexibility, anti-pattern 7 honored)
- `CLAUDE.md` (root, anti-pattern 7)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section D.24 multi-vendor adapter)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.11 Crius)
- `docs/contracts/agent_orchestration_runtime.contract.md` (user-visible model selection integration)
- `docs/contracts/marketplace_search.contract.md` (embedding fallback)
- `docs/contracts/feature_flag.contract.md` (kill-switch flags)
- `docs/contracts/postgres_multi_tenant.contract.md` (per-tenant vendor config scoping)

## 3. Schema Definition

### 3.1 Database tables

```sql
CREATE TABLE vendor_adapter_config (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL for platform defaults
  vendor               text NOT NULL CHECK (vendor IN ('anthropic', 'openai', 'voyage', 'vllm_local')),
  capability           text NOT NULL CHECK (capability IN ('chat', 'embedding', 'image_gen', 'tts', 'vision')),
  api_key_encrypted    bytea NOT NULL,                    -- AES-256-GCM ciphertext
  api_key_dek_wrapped  bytea NOT NULL,                    -- DEK wrapped by KEK
  api_key_nonce        bytea NOT NULL,                    -- 12-byte GCM nonce
  base_url             text,                              -- override endpoint if not default
  priority             int NOT NULL DEFAULT 100,          -- lower = preferred; ordered fallback sort
  enabled              boolean NOT NULL DEFAULT true,
  circuit_state        text NOT NULL DEFAULT 'closed' CHECK (circuit_state IN ('closed', 'open', 'half_open')),
  failure_count        int NOT NULL DEFAULT 0,
  last_failure_at      timestamptz,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vendor, capability)
);

CREATE TABLE vendor_adapter_audit (
  id                   bigserial PRIMARY KEY,
  config_id            uuid NOT NULL REFERENCES vendor_adapter_config(id),
  actor_user_id        uuid,
  action               text NOT NULL CHECK (action IN ('create', 'update', 'rotate_key', 'disable', 'enable', 'circuit_open', 'circuit_close')),
  old_state            jsonb,
  new_state            jsonb,
  reason               text,
  occurred_at          timestamptz NOT NULL DEFAULT now()
);
```

`vendor_adapter_config` is a GLOBAL table for `tenant_id IS NULL` (platform defaults, e.g., Anthropic credentials for MA sessions) + tenant-scoped rows for user-managed keys.

### 3.2 Envelope encryption

- KEK (Key Encryption Key): 256-bit AES key stored in Hetzner systemd EnvironmentFile `/etc/nerium/kek.env` with `chmod 600` ownership `nerium:nerium`. NOT in git, NOT in Postgres. Loaded at process boot via pydantic-settings.
- DEK (Data Encryption Key): per-record 256-bit AES key. Generated at key insertion time.
- `api_key_encrypted = AES_GCM(DEK, api_key_plaintext, nonce=12_bytes)`
- `api_key_dek_wrapped = AES_GCM(KEK, DEK, nonce=12_bytes)`
- Decryption: unwrap DEK using KEK, then decrypt api_key with DEK + nonce.

KEK rotation: dual-KEK grace window (retiring KEK accepts decryption, new KEK encrypts writes). Rotation cron rewraps all DEKs under new KEK over 24 h.

### 3.3 Circuit breaker + retry

Circuit breaker via `pybreaker`:
- `fail_max=5` consecutive failures → circuit opens
- `reset_timeout=30` seconds → circuit half-opens
- `success_threshold=2` successes in half-open → closes
- Circuit state persisted to `vendor_adapter_config.circuit_state` for cross-worker consistency (Redis pub/sub invalidation)

Tenacity retry inside circuit-closed state:
- Initial 0.5 s, max 8 s exponential backoff
- Jitter 0.25
- Max 3 attempts
- Retry only on connection errors + 5xx; do NOT retry 4xx

### 3.4 Fallback chain

Chat capability default chain (admin-configurable):

```
priority 10: anthropic (claude-opus-4-7)       (primary per anti-pattern 7)
priority 20: anthropic (claude-opus-4-6)       (same vendor, older model fallback)
priority 100: openai (gpt-4o)                  (user-visible only, requires ModelSelector opt-in)
```

Embedding capability default chain:

```
priority 10: voyage (voyage-3.5)
priority 20: openai (text-embedding-3-small)
```

Hemera flag `vendor.<vendor>.disabled` (boolean) short-circuits chain step. `vendor.chat.fallback_allowed` (boolean) gates cross-vendor chat fallback (default `false` to honor anti-pattern 7).

## 4. Interface / API Contract

### 4.1 VendorAdapter interface

```python
# src/backend/protocol/adapter.py

from abc import ABC, abstractmethod
from typing import AsyncIterator

class VendorAdapter(ABC):
    vendor: str
    capability: str

    @abstractmethod
    async def chat_complete(self, messages: list[dict], **params) -> dict: ...

    @abstractmethod
    async def chat_stream(self, messages: list[dict], **params) -> AsyncIterator[dict]: ...

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...

    @abstractmethod
    async def health_check(self) -> bool: ...
```

Concrete adapters:

- `AnthropicAdapter` (uses `anthropic` SDK)
- `OpenAIAdapter` (uses `openai` SDK)
- `VoyageAdapter` (uses `voyageai` SDK)
- `VLLMLocalAdapter` (stub, HTTP POST to localhost vLLM server; post-hackathon)

### 4.2 Fallback router

```python
# src/backend/protocol/router.py

class CapabilityRouter:
    def __init__(self, capability: str, tenant_id: UUID | None): ...

    async def dispatch(self, method: str, *args, **kwargs):
        configs = await load_ordered_configs(self.capability, self.tenant_id)
        last_error = None
        for config in configs:
            if not config.enabled or config.circuit_state == 'open':
                continue
            if hemera.flag(f"vendor.{config.vendor}.disabled"):
                continue
            if self.capability == 'chat' and config.vendor != 'anthropic':
                if not hemera.flag("vendor.chat.fallback_allowed"):
                    continue
            adapter = load_adapter(config)
            try:
                result = await invoke_with_retry(adapter, method, *args, **kwargs)
                self._on_success(config)
                return result
            except VendorError as e:
                last_error = e
                self._on_failure(config, e)
        raise AllVendorsFailedError(capability=self.capability, last_error=last_error)
```

### 4.3 Endpoints

- `POST /v1/protocol/vendors`: create/update vendor config (admin only or tenant-owner per RLS). Accepts plaintext api_key in body over HTTPS; server encrypts immediately + never stores plaintext.
- `GET /v1/protocol/vendors`: list configs. Response MUST redact api_key (return `api_key_preview: "sk-****1234"`).
- `POST /v1/protocol/vendors/{id}/rotate-key`: key rotation. Accepts new plaintext; re-encrypts under current KEK. Emits audit entry.
- `POST /v1/protocol/vendors/{id}/disable`: mark disabled (does not delete row for audit trail).
- `GET /v1/protocol/circuit-state`: admin view of all circuit states.

### 4.4 Circuit state sync

Circuit state changes emit Redis pub/sub `circuit:state` with payload `{config_id, new_state, reason}`. All API workers subscribe and update local in-memory state. Initial load from DB on boot.

Cross-worker consistency: state reflects within 100 ms pod-wide.

### 4.5 Health check cron

Arq cron every 2 min runs `vendor_health_check`:
- For each enabled config, call `adapter.health_check()`.
- Failure increments `failure_count` (bounded to `fail_max`).
- 2 consecutive successes from half-open closes circuit.

## 5. Event Signatures

Wire events:

| Event | Payload | Consumer |
|---|---|---|
| `nerium.protocol.vendor_degraded` | `{vendor, capability, reason}` | admin + tenant UI |
| `nerium.protocol.vendor_restored` | `{vendor, capability}` | admin + tenant UI |
| `nerium.protocol.fallback_triggered` | `{primary, fallback, reason}` | admin dashboard |

Log:

| Event | Fields |
|---|---|
| `vendor.call.started` | `vendor`, `capability`, `method`, `tenant_id` |
| `vendor.call.completed` | `vendor`, `duration_ms`, `cost_usd_estimated` |
| `vendor.call.failed` | `vendor`, `error_kind`, `attempt` |
| `vendor.circuit.opened` | `vendor`, `capability`, `consecutive_failures` |
| `vendor.circuit.closed` | `vendor`, `capability` |
| `vendor.fallback.used` | `primary`, `fallback`, `capability` |
| `vendor.key.rotated` | `config_id`, `actor_user_id` |

OTel spans: `vendor.<capability>.<method>` with `vendor.name` attribute.

## 6. File Path Convention

- Base adapter interface: `src/backend/protocol/adapter.py`
- Per-vendor adapters: `src/backend/protocol/adapters/anthropic.py`, `openai.py`, `voyage.py`, `vllm_local.py`
- Router: `src/backend/protocol/router.py`
- Circuit breaker wrapper: `src/backend/protocol/circuit_breaker.py`
- Retry wrapper: `src/backend/protocol/retry.py`
- Envelope crypto: `src/backend/protocol/crypto.py`
- Key vault (KEK loader): `src/backend/protocol/key_vault.py`
- Config store: `src/backend/protocol/config_store.py`
- Health check cron: `src/backend/workers/vendor_health_cron.py`
- Router endpoints: `src/backend/routers/v1/protocol/vendor.py`
- Migrations: `src/backend/db/migrations/XXX_vendor_adapter_config.py`, `XXX_vendor_adapter_audit.py`
- Seed: `src/backend/db/seed/default_vendor_configs.sql` (platform Anthropic + Voyage)
- Tests: `tests/protocol/test_envelope_encryption.py`, `test_circuit_breaker.py`, `test_fallback_chain.py`, `test_kek_rotation.py`, `test_health_check_cron.py`

## 7. Naming Convention

- Vendor enum: `anthropic`, `openai`, `voyage`, `vllm_local` lowercase.
- Capability enum: `chat`, `embedding`, `image_gen`, `tts`, `vision`.
- Config unique constraint: `(tenant_id, vendor, capability)` means one config per vendor + capability per tenant + one global (NULL tenant) default.
- Hemera flag names: `vendor.<vendor>.disabled`, `vendor.chat.fallback_allowed`.
- Redis pub/sub channel: `circuit:state`.
- Audit actions: `snake_case` lowercase.

## 8. Error Handling

- Encryption failure (KEK missing at boot): process fails fast, log CRITICAL, systemd restarts with alert.
- Decryption failure (DEK wrapped under retired KEK): log WARN, attempt retiring KEK unwrap; if still fails, circuit opens that config, emit `vendor.key.corrupt`.
- All vendors fail: `AllVendorsFailedError` → HTTP 502 `upstream_unavailable`. Kratos marks session `failed` with error_kind `all_vendors_failed`.
- Anthropic-only enforcement: `capability=chat` + non-Anthropic vendor + `vendor.chat.fallback_allowed=false` → skip to next config silently.
- Circuit open + no fallback: HTTP 503 `service_unavailable` with `retry_after` hint pointing to `reset_timeout`.
- KEK rotation mid-flight write: in-flight encrypt uses new KEK; in-flight decrypt tries new first then retiring.
- API key leak in logs: filter middleware redacts `sk-*` pattern strings + `api_key` JSON fields. Audit: Selene test verifies no plaintext in log samples.
- Plaintext api_key in POST response accidentally: HTTP 500, never return plaintext beyond initial CREATE response (which echoes for user to confirm, then is permanently redacted).

## 9. Testing Surface

- Envelope encrypt/decrypt round trip: encrypt api_key, store, decrypt, match.
- KEK rotation: rotate, retiring KEK accepts decrypt, new KEK encrypts writes, rewrap cron completes within 24 h window simulated.
- Circuit opens after 5 consecutive failures: simulated 5 failures, `circuit_state=open`, requests skip config.
- Circuit half-open after `reset_timeout`: 30 s elapsed, next request attempts, on success + 1 more success → closes.
- Tenacity retry on 5xx: mocked 502 twice, 200 third → success.
- Tenacity no-retry on 4xx: mocked 400 → immediate fail no retry.
- Fallback chain Anthropic failure → OpenAI when `fallback_allowed=true`: request completes via OpenAI.
- Anti-pattern 7 default: `fallback_allowed=false`, Anthropic 502 → `AllVendorsFailedError` (does not silently fall to OpenAI).
- Embedding fallback Voyage → OpenAI: Voyage 429, request completes via OpenAI; embedding dimension mismatch handled via padding/truncation warning.
- Health check cron: 3 failed health checks → circuit opens.
- Cross-worker sync: worker A opens circuit, worker B receives pub/sub within 100 ms.
- Audit trail: create + update + disable logged in `vendor_adapter_audit`.
- Key redaction in list response: GET returns `api_key_preview`, not full plaintext.
- Hemera flag kills vendor: `vendor.openai.disabled=true`, router skips OpenAI config.

## 10. Open Questions

- vLLM local adapter scope: stub-only at submission or functional? Recommend stub (returns HTTP 501 `not_implemented`) with full impl post-hackathon when local inference infra budgeted.
- Per-tenant Anthropic key bring-your-own: allowed? Yes for enterprise tier, managed via admin + Hemera flag `vendor.bring_your_own_anthropic`.
- Image gen adapter (Imagen 4 / DALL-E / Stable Diffusion): scaffold in schema but no implementation at submission; documented as post-hackathon.

## 11. Post-Hackathon Refactor Notes

- KMS integration (Hetzner has none; consider Vault self-host or Cloudflare KMS beta).
- Per-request cost attribution to tenant's ledger (via `budget_monitor.contract.md` integration).
- Dynamic vendor selection learned from per-tenant success rate.
- Prompt caching coordination across vendors (Anthropic prompt cache + OpenAI prompt caching with different semantics).
- Vendor-specific capability extensions (Anthropic thinking blocks, OpenAI parallel_tool_calls). IR schema upgrades per quarter.
- Local vLLM + Hugging Face Inference Endpoint support for self-hosted users.
- Vendor quota tracking: per-vendor API key monthly budget + cap.
- Circuit breaker + retry observability dashboard in Eunomia.
- Automated KEK rotation (currently manual).
- Post-quantum encryption migration path (ML-KEM for DEK wrapping when stable).
