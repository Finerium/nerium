"""File storage surface.

Owner: Chione (W1, NP phase). Cloudflare R2 via boto3 S3-compatible client,
presigned POST upload (25 MB cap, 900s expiry), ClamAV sidecar virus scan
(async via Arq), quarantine on detection, CDN direct-serve for public assets.

Contract: docs/contracts/file_storage.contract.md (Pythia-v3 authority).
Research: docs/phase_np/RV_NP_RESEARCH.md Section E.28.
Structure: docs/phase_np/RV_NP_AGENT_STRUCTURE.md Section 4.13.
"""
