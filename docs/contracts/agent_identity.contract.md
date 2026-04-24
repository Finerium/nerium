# Agent Identity

**Contract Version:** 0.2.0
**Owner Agent(s):** Tethys (cryptographic identity authority, Ed25519 signing, key rotation with grace window, public key pinning). Hecate (P0 origin author, deprecated as owner per NP amendment).
**Consumer Agent(s):** Astraea (trust score per identity per `trust_score.contract.md` v0.2.0), Phanes (listing.creator_identity_id FK), Iapetus (commerce.creator_user_id + payout binding), Kratos (verify tool_use signatures on MA session), Khronos (MCP `get_agent_identity` tool per `mcp_tool_registry.contract.md`), Crius (separate vendor identity pattern shares Ed25519 primitives), Eunomia (admin identity moderation), Selene (audit emission), Nemea-RV-v2 (rotation grace E2E)
**Stability:** stable for NP
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3 amendment)
**Changelog v0.2.0:** Replaced advisory `prompt_hash` + `contract_hash` with cryptographic Ed25519 signatures (PyNaCl). Added `public_key` + `public_key_fingerprint` + `key_status` + `retires_at` columns. Added 14-day key rotation grace window (retiring status accepts both old + new). Added signature verification pattern for artifact attestation. JWT EdDSA short-lived bearer reserved for realtime ticket use only per `realtime_bus.contract.md`.

## 1. Purpose

Defines the canonical agent identity schema in NP era: Ed25519 keypair per identity via PyNaCl (libsodium), public key pinning at registration, raw detached signatures on artifacts for tamper-evident verifiability, 14-day rotation grace window. Identity surfaces via Registry pillar per NarasiGhaisan Section 6 (shallow-by-design but cryptographically real at NP not mocked at P0).

P0 v0.1.0 shipped advisory `prompt_hash` + `contract_hash` string fields. NP v0.2.0 replaces those with real cryptographic primitives. Migration path: existing identities gain `public_key` on next update or via admin-triggered rotation.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 6 Registry shallow-by-design)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section D.23 Ed25519 PyNaCl + rotation)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.10 Tethys)
- `docs/contracts/trust_score.contract.md` v0.2.0 (Bayesian + Wilson formulas consume identity)
- `docs/contracts/marketplace_listing.contract.md` v0.2.0 (listing creator FK)
- `docs/contracts/postgres_multi_tenant.contract.md` (RLS per tenant)
- `docs/contracts/oauth_dcr.contract.md` (JWT pattern reuse awareness)

## 3. Schema Definition

### 3.1 Database table

```sql
CREATE TYPE identity_kind AS ENUM ('creator', 'agent', 'platform', 'system');
CREATE TYPE identity_key_status AS ENUM ('active', 'retiring', 'revoked');

CREATE TABLE agent_identity (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid REFERENCES tenant(id) ON DELETE CASCADE,  -- NULL for platform-level
  owner_user_id            uuid REFERENCES app_user(id) ON DELETE CASCADE,
  handle                   citext UNIQUE NOT NULL,            -- lowercase, max 40 chars
  display_name             text NOT NULL,
  kind                     identity_kind NOT NULL,
  vendor_origin            text NOT NULL CHECK (vendor_origin IN (
    'hand_coded','cursor','claude_code','replit','bolt','lovable',
    'claude_skills','gpt_store','mcp_hub','huggingface_space',
    'langchain_hub','vercel_gallery','cloudflare_marketplace','other'
  )),
  version                  text NOT NULL,                      -- semver
  capability_tags          text[] NOT NULL DEFAULT '{}',
  public_key               bytea NOT NULL,                     -- Ed25519 pubkey 32 bytes
  public_key_fingerprint   text NOT NULL,                      -- sha256:base64url first 16 bytes
  key_status               identity_key_status NOT NULL DEFAULT 'active',
  retires_at               timestamptz,                         -- set when key_status='retiring'
  retiring_public_key      bytea,                               -- prior pubkey accepted during grace
  retiring_fingerprint     text,
  artifact_manifest        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {prompt: {sha256, signature}, contract: {...}}
  trust_score_pointer      text,                                -- path or URL to latest trust score
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz                          -- soft delete per GDPR
);

CREATE INDEX idx_identity_handle ON agent_identity(handle) WHERE deleted_at IS NULL;
CREATE INDEX idx_identity_fingerprint ON agent_identity(public_key_fingerprint);
CREATE INDEX idx_identity_retires ON agent_identity(retires_at) WHERE key_status = 'retiring';

-- RLS: owner tenant reads + writes; platform identities (tenant_id NULL) readable by all, writable by superuser
ALTER TABLE agent_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON agent_identity FOR SELECT USING (
  tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid
);
CREATE POLICY tenant_write ON agent_identity FOR UPDATE USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
);

CREATE TABLE agent_identity_audit (
  id             bigserial PRIMARY KEY,
  identity_id    uuid NOT NULL REFERENCES agent_identity(id) ON DELETE CASCADE,
  actor_user_id  uuid,
  kind           text NOT NULL CHECK (kind IN ('registered', 'updated', 'key_rotated', 'revoked', 'capability_tag_added', 'capability_tag_removed', 'attestation_added')),
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);
```

### 3.2 Pydantic models

```python
class RegisterIdentityRequest(BaseModel):
    handle: str = Field(..., pattern=r'^[a-z0-9_]+$', max_length=40)
    display_name: str = Field(..., max_length=100)
    kind: Literal['creator','agent','platform','system']
    vendor_origin: Literal[...]                            # per DB enum
    version: str = Field(..., pattern=r'^\d+\.\d+\.\d+$')
    capability_tags: list[str] = Field(default_factory=list, max_length=10)
    public_key_b64: str                                    # base64url-encoded 32-byte Ed25519 pubkey
    artifact_manifest: dict = Field(default_factory=dict)  # {prompt: {sha256, signature_b64}, contract: {...}}

class AgentIdentityResponse(BaseModel):
    id: str
    handle: str
    display_name: str
    kind: str
    vendor_origin: str
    version: str
    capability_tags: list[str]
    public_key_b64: str
    public_key_fingerprint: str
    key_status: Literal['active','retiring','revoked']
    retires_at: str | None
    trust_score_pointer: str | None
    created_at: str
    updated_at: str
```

### 3.3 Artifact manifest shape

```json
{
  "prompt": {
    "sha256": "<hex>",
    "signature_b64": "<base64url Ed25519 detached signature of sha256>",
    "signed_at": "2026-04-27T06:00:00Z"
  },
  "contract": {
    "path": ".claude/agents/apollo.md",
    "sha256": "<hex>",
    "signature_b64": "<base64url>"
  },
  "skill_bundle": {
    "path": ".claude/skills/phaser-gamedev",
    "sha256": "<tree sha256>",
    "signature_b64": "<base64url>"
  }
}
```

Signing: `nacl.signing.SigningKey(private_key).sign(sha256_bytes).signature`. Verification: `nacl.signing.VerifyKey(public_key).verify(sha256_bytes, signature)`.

## 4. Interface / API Contract

### 4.1 POST `/v1/registry/identities`

Registers a new identity.

Body: `RegisterIdentityRequest`.

Server decodes `public_key_b64` (base64url) to 32 bytes. Validates length + that key is a valid Ed25519 point. Stores `public_key` + computes fingerprint. If `artifact_manifest.*.signature_b64` present, server verifies each signature against declared `sha256` using the new public key; registration rejected with 400 `invalid_signature` on mismatch.

Response: `AgentIdentityResponse`.

### 4.2 POST `/v1/registry/identities/{id}/rotate-key`

Rotates identity signing key.

Body:
```json
{
  "new_public_key_b64": "<32 bytes base64url>",
  "continuity_signature_b64": "<old key signs sha256(new_key)>",
  "artifact_manifest_resigned": { ... }                 // optional, re-signed artifacts
}
```

Server:
1. Verifies `continuity_signature_b64` using current (pre-rotation) `public_key`.
2. Sets `retiring_public_key = public_key`, `retiring_fingerprint = public_key_fingerprint`, `key_status = 'retiring'`, `retires_at = now() + 14 days`.
3. Updates `public_key = new_public_key` + recomputes fingerprint.
4. Emits `registry.identity.key_rotated` audit entry.

During 14-day grace: verifier accepts signatures made with either current OR retiring key. Cron `key_rotation_sweep` at 00:00 UTC flips `key_status = 'revoked'` + nulls `retiring_*` columns when `retires_at < now()`.

### 4.3 POST `/v1/registry/identities/{id}/revoke`

Immediate revocation (lost key, compromise). Sets `key_status = 'revoked'` without grace period. All subsequent signature verifications fail. Requires admin scope OR identity owner with optional 2FA.

### 4.4 POST `/v1/registry/verify`

Verifies a signature against a registered identity.

Body:
```json
{
  "identity_id": "<uuid>",
  "sha256_hex": "<64-char hex>",
  "signature_b64": "<base64url>"
}
```

Response:
```json
{
  "valid": true,
  "key_status_at_verify": "active" | "retiring" | "revoked",
  "verified_with_key": "current" | "retiring",
  "verified_at": "2026-04-27T06:00:00Z"
}
```

### 4.5 GET `/v1/registry/identities/{id}`

Returns `AgentIdentityResponse`. Tenant-scoped + platform-readable.

### 4.6 GET `/v1/registry/identities`

Paginated list. Filters: `?handle_prefix=`, `?kind=`, `?vendor_origin=`, `?capability_tag=`.

### 4.7 GET `/v1/registry/identities/{id}/audit`

Tenant-scoped audit trail.

## 5. Event Signatures

Wire events per `realtime_bus.contract.md`:

| Event | Payload |
|---|---|
| `nerium.registry.identity_registered` | `{identity_id, handle, kind, owner_user_id}` |
| `nerium.registry.identity_key_rotated` | `{identity_id, retires_at}` |
| `nerium.registry.identity_revoked` | `{identity_id, reason}` |

Log:

| Event | Fields |
|---|---|
| `registry.identity.registered` | `identity_id`, `handle`, `kind`, `vendor_origin` |
| `registry.identity.verified` | `identity_id`, `verified_with_key`, `sha256_hex` |
| `registry.identity.verify_failed` | `identity_id`, `reason` (`invalid_signature`, `revoked`, `unknown`) |
| `registry.identity.key_rotated` | `identity_id`, `old_fingerprint`, `new_fingerprint` |
| `registry.identity.grace_expired` | `identity_id`, `retired_key_fingerprint` |

## 6. File Path Convention

- Identity service: `src/backend/registry/identity.py`
- Ed25519 primitives: `src/backend/registry/crypto.py` (PyNaCl wrapper)
- Rotation scheduler: `src/backend/registry/rotation.py` (Arq cron)
- Audit helper: `src/backend/registry/audit.py`
- Verification endpoint: `src/backend/registry/verify.py`
- Router: `src/backend/routers/v1/registry/identity.py`
- Migrations: `src/backend/db/migrations/XXX_agent_identity.py`, `XXX_agent_identity_audit.py`, `XXX_agent_identity_v2_ed25519.py` (upgrade from v0.1.0 adds `public_key` + `key_status` columns)
- Tests: `tests/registry/test_register_identity.py`, `test_signature_verify.py`, `test_rotation_grace.py`, `test_reuse_detection.py`, `test_rls_tenant_scope.py`

## 7. Naming Convention

- Handle: `snake_case` lowercase alphanumeric + underscore, max 40.
- Public key serialization: base64url 32 bytes.
- Fingerprint: `sha256:<base64url 16 bytes>`.
- Key status: lowercase single word.
- Kind + vendor_origin enums: lowercase snake.
- Capability tags: lowercase snake.
- Audit action kinds: `snake_case` past-tense.

## 8. Error Handling

- Public key decode fails (not base64url / not 32 bytes): HTTP 400 `invalid_public_key`.
- Duplicate handle: HTTP 409 `handle_taken`.
- Artifact signature verify fails at registration: HTTP 400 `invalid_signature`.
- Rotation without continuity signature: HTTP 400 `missing_continuity_signature`.
- Verification against revoked key: HTTP 200 with `valid: false` + `key_status_at_verify: "revoked"` (not an error; indicates key state).
- Verification against unknown identity: HTTP 404.
- PyNaCl Ed25519 invalid point: HTTP 400 `invalid_public_key`.
- Cross-tenant identity read rejected: HTTP 404 (hide existence).
- Key rotation sweep cron missed (pod restart): sweep on boot + next scheduled run; grace window may extend by up to 24 h acceptable.

## 9. Testing Surface

- Register happy path: POST with valid Ed25519 pubkey, identity created + fingerprint correct.
- Duplicate handle: 409.
- Invalid pubkey (31 bytes): 400.
- Artifact manifest signature valid: registration accepted + verification succeeds.
- Artifact manifest signature invalid: 400.
- Rotation with continuity: old key used to sign new key hash, rotation succeeds, both keys valid during grace.
- Rotation without continuity: 400.
- Signature verify during grace with retiring key: `valid: true, verified_with_key: "retiring"`.
- Grace expiry: cron flips `revoked`, subsequent verify `valid: true, verified_with_key: null, key_status_at_verify: "revoked"` with audit log.
- Revoke: immediate status flip, all subsequent verify fail.
- RLS tenant scope: other tenant identity not readable.
- Platform identity (tenant_id NULL) readable by all tenants.
- Side-channel: constant-time signature verification (nacl.signing uses libsodium constant-time; unit test timing independence).
- Key rotation chain: rotate twice, verify old signature against grandparent fingerprint still available in audit.

## 10. Open Questions

- Key rotation cadence recommendation: default 90 days for platform identities, opt-in for user identities.
- Public key recovery if user loses private key: no recovery mechanism (cryptographic commitment); admin can revoke + user re-registers with new handle OR admin approves identity transfer to new handle.
- Cross-platform DID integration (W3C DID spec): post-hackathon.

## 11. Post-Hackathon Refactor Notes

- Hardware-backed keys (YubiKey, passkey WebAuthn) for enterprise tier identities.
- Decentralized identifier (DID) method `did:web:nerium.com:<handle>` for cross-platform portability.
- Identity delegation chains (agent acts on behalf of creator) via scoped attestation.
- Revocation certificate distribution (OCSP-like) so external verifiers check revocation without querying NERIUM.
- Threshold signatures for multi-owner identities (e.g., organization-owned agents).
- Post-quantum migration path (ML-DSA / Falcon) when stable.
- Identity reputation portability (import trust from GitHub, prior marketplaces).
- Transparency log (Certificate-Transparency-like) so every identity registration is publicly auditable.
- Identity linkage to external auth (OAuth GitHub) for creator-verified badge.
- Signed commit enforcement on Marketplace listing updates (creator's identity signs the new artifact manifest).
