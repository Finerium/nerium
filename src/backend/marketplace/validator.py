"""Category metadata + pricing validators for marketplace listings.

Owner: Phanes (W2 NP P1 Session 1). Contract refs:
    - ``docs/contracts/marketplace_listing.contract.md`` Section 3.5
      per-category sub-schema dispatch.
    - ``docs/contracts/marketplace_listing.contract.md`` Section 3.4
      pricing_details shape-by-model.
    - ``docs/contracts/marketplace_listing.contract.md`` Section 4.3
      publish-time validation pipeline shape.

Usage
-----
::

    from src.backend.marketplace.validator import (
        validate_category_metadata,
        validate_pricing_details,
        validate_for_publish,
    )

    issues = validate_category_metadata(
        category=Category.ASSETS,
        category_metadata={"media_type": "image", "file_format": "png"},
    )
    if issues:
        raise ValidationProblem(detail=..., extensions={"errors": ...})

Design notes
------------
- Return list-of-issues rather than raise so the caller decides whether
  to short-circuit on first failure or surface every problem at once
  (the publish endpoint accumulates all issues).
- No async calls here. Asset virus-scan status is queried in the
  service layer (pending consumer work) and fed in as a pre-computed
  bool list to keep this module pure / cheaply unit-testable.
- ``validate_for_publish`` is the composition entry point the router
  calls immediately before flipping ``status`` to ``published``.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ValidationError

from src.backend.marketplace.schemas import (
    AssetsMetadata,
    ContentMetadata,
    CoreAgentMetadata,
    DataMetadata,
    InfrastructureMetadata,
    PremiumMetadata,
    ServicesMetadata,
)
from src.backend.models.marketplace_listing import (
    ALLOWED_SUBTYPES,
    Category,
    PricingModel,
    Subtype,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ValidationIssue:
    """Single validation problem surfaced to the publish response.

    Attributes
    ----------
    field
        Dotted path to the offending field.
    code
        Stable slug callers can map to UI copy.
    message
        Human-readable description of what went wrong.
    """

    field: str
    code: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {"field": self.field, "code": self.code, "message": self.message}


# Dispatch table - one sub-schema class per category. Do not reorder;
# tests assert on the keys being the full 7-category set.
CATEGORY_SCHEMA_MAP: dict[Category, type[BaseModel]] = {
    Category.CORE_AGENT: CoreAgentMetadata,
    Category.CONTENT: ContentMetadata,
    Category.INFRASTRUCTURE: InfrastructureMetadata,
    Category.ASSETS: AssetsMetadata,
    Category.SERVICES: ServicesMetadata,
    Category.PREMIUM: PremiumMetadata,
    Category.DATA: DataMetadata,
}


def validate_subtype_for_category(
    *,
    category: Category,
    subtype: Subtype,
) -> list[ValidationIssue]:
    """Return a single-issue list iff the subtype is not in the category.

    The model-level ``ListingCreate`` validator already catches this at
    request-parse time; :func:`validate_for_publish` reruns the check
    defensively because draft rows written before a contract revision
    may carry stale subtype values.
    """

    allowed = ALLOWED_SUBTYPES.get(category, frozenset())
    if subtype in allowed:
        return []
    return [
        ValidationIssue(
            field="subtype",
            code="subtype_not_in_category",
            message=(
                f"Subtype '{subtype.value}' is not permitted for category "
                f"'{category.value}'. See contract Section 3.1."
            ),
        )
    ]


def validate_category_metadata(
    *,
    category: Category,
    category_metadata: dict[str, Any],
) -> list[ValidationIssue]:
    """Validate ``category_metadata`` against the per-category sub-schema.

    Returns
    -------
    list[ValidationIssue]
        Empty list on success. One issue per Pydantic error on failure.
        Pydantic field paths (``loc`` tuples) are dot-joined for display.
    """

    schema_cls = CATEGORY_SCHEMA_MAP.get(category)
    if schema_cls is None:
        return [
            ValidationIssue(
                field="category",
                code="unknown_category",
                message=f"No sub-schema registered for category '{category.value}'.",
            )
        ]
    try:
        schema_cls.model_validate(category_metadata)
    except ValidationError as exc:
        issues: list[ValidationIssue] = []
        for err in exc.errors():
            loc = err.get("loc", ())
            field = "category_metadata"
            if loc:
                field = "category_metadata." + ".".join(str(p) for p in loc)
            issues.append(
                ValidationIssue(
                    field=field,
                    code=str(err.get("type", "value_error")),
                    message=str(err.get("msg", "")),
                )
            )
        return issues
    return []


def validate_pricing_details(
    *,
    pricing_model: PricingModel,
    pricing_details: dict[str, Any],
) -> list[ValidationIssue]:
    """Validate the ``pricing_details`` shape for the given model.

    Rules per contract Section 3.4:

    - ``free``: empty dict (ignore any keys present; no requirements).
    - ``one_time``: requires ``amount_cents`` (int >= 0) + ``currency``.
    - ``subscription_*``: same as one_time; ``stripe_price_id`` optional.
    - ``usage_based``: requires ``meter`` in {per_execution, per_token,
      per_minute} + ``rate_cents`` + ``currency``.
    - ``tiered``: requires ``tiers`` list, each with ``name`` +
      ``max_units`` + ``amount_cents`` + ``currency``.

    Validation is conservative: missing fields surface; extra fields are
    ignored so future contract revisions do not break older clients.
    """

    issues: list[ValidationIssue] = []

    if pricing_model == PricingModel.FREE:
        return issues  # nothing to validate

    if pricing_model in (
        PricingModel.ONE_TIME,
        PricingModel.SUBSCRIPTION_MONTHLY,
        PricingModel.SUBSCRIPTION_YEARLY,
    ):
        _require_amount_and_currency(pricing_details, issues)
        return issues

    if pricing_model == PricingModel.USAGE_BASED:
        meter = pricing_details.get("meter")
        if meter not in {"per_execution", "per_token", "per_minute"}:
            issues.append(
                ValidationIssue(
                    field="pricing_details.meter",
                    code="meter_required",
                    message=(
                        "usage_based pricing requires meter in "
                        "{per_execution, per_token, per_minute}."
                    ),
                )
            )
        _require_rate_cents(pricing_details, issues)
        _require_currency(pricing_details, issues)
        return issues

    if pricing_model == PricingModel.TIERED:
        tiers = pricing_details.get("tiers")
        if not isinstance(tiers, list) or not tiers:
            issues.append(
                ValidationIssue(
                    field="pricing_details.tiers",
                    code="tiers_required",
                    message="tiered pricing requires a non-empty tiers list.",
                )
            )
            return issues
        for idx, tier in enumerate(tiers):
            if not isinstance(tier, dict):
                issues.append(
                    ValidationIssue(
                        field=f"pricing_details.tiers[{idx}]",
                        code="tier_not_object",
                        message="Each tier entry must be an object.",
                    )
                )
                continue
            for required in ("name", "max_units", "amount_cents"):
                if required not in tier:
                    issues.append(
                        ValidationIssue(
                            field=f"pricing_details.tiers[{idx}].{required}",
                            code="tier_field_required",
                            message=f"Missing tier field '{required}'.",
                        )
                    )
        _require_currency(pricing_details, issues)
        return issues

    # Defensive: unhandled model. Surfaces if enum expands without this
    # dispatch updating - tests assert on full coverage.
    issues.append(
        ValidationIssue(
            field="pricing_model",
            code="unsupported_pricing_model",
            message=f"No validator registered for pricing model '{pricing_model.value}'.",
        )
    )
    return issues


def validate_for_publish(
    *,
    category: Category,
    subtype: Subtype,
    pricing_model: PricingModel,
    pricing_details: dict[str, Any],
    category_metadata: dict[str, Any],
    long_description: str | None,
    asset_refs_clean: list[bool] | None = None,
) -> list[ValidationIssue]:
    """Aggregate publish-time validation per contract Section 4.3.

    Parameters
    ----------
    asset_refs_clean
        Optional list of booleans the caller passes after checking each
        asset's virus_scan_status. Any ``False`` surfaces an
        ``asset_not_scanned_clean`` issue. When ``None`` (default), the
        asset-scan rule is skipped - the service layer is responsible
        for fetching scan status from Chione before calling us.
    """

    issues: list[ValidationIssue] = []
    issues.extend(validate_subtype_for_category(category=category, subtype=subtype))
    issues.extend(
        validate_category_metadata(
            category=category, category_metadata=category_metadata
        )
    )
    issues.extend(
        validate_pricing_details(
            pricing_model=pricing_model, pricing_details=pricing_details
        )
    )

    if not long_description or not long_description.strip():
        issues.append(
            ValidationIssue(
                field="long_description",
                code="description_required_for_public",
                message=(
                    "long_description is required to publish a listing. "
                    "Drafts may omit it."
                ),
            )
        )

    if asset_refs_clean is not None:
        for idx, is_clean in enumerate(asset_refs_clean):
            if not is_clean:
                issues.append(
                    ValidationIssue(
                        field=f"asset_refs[{idx}]",
                        code="asset_not_scanned_clean",
                        message=(
                            "Referenced asset has not been scanned clean "
                            "by Chione's ClamAV pipeline."
                        ),
                    )
                )
    return issues


def _require_amount_and_currency(
    pricing_details: dict[str, Any], issues: list[ValidationIssue]
) -> None:
    _require_amount_cents(pricing_details, issues)
    _require_currency(pricing_details, issues)


def _require_amount_cents(
    pricing_details: dict[str, Any], issues: list[ValidationIssue]
) -> None:
    value = pricing_details.get("amount_cents")
    if not isinstance(value, int) or value < 0:
        issues.append(
            ValidationIssue(
                field="pricing_details.amount_cents",
                code="amount_cents_required",
                message="amount_cents must be a non-negative integer.",
            )
        )


def _require_rate_cents(
    pricing_details: dict[str, Any], issues: list[ValidationIssue]
) -> None:
    value = pricing_details.get("rate_cents")
    if not isinstance(value, int) or value < 0:
        issues.append(
            ValidationIssue(
                field="pricing_details.rate_cents",
                code="rate_cents_required",
                message="rate_cents must be a non-negative integer.",
            )
        )


def _require_currency(
    pricing_details: dict[str, Any], issues: list[ValidationIssue]
) -> None:
    currency = pricing_details.get("currency")
    if not isinstance(currency, str) or len(currency) != 3:
        issues.append(
            ValidationIssue(
                field="pricing_details.currency",
                code="currency_required",
                message="currency must be a 3-letter ISO 4217 code.",
            )
        )


# Small helper used by the service when persisting pricing_details to
# jsonb (asyncpg does not have a default jsonb codec per pool config).
def pricing_details_to_jsonb_text(pricing_details: dict[str, Any]) -> str:
    """Serialize a pricing_details dict to JSON text for asyncpg jsonb."""

    return json.dumps(pricing_details, separators=(",", ":"), sort_keys=True)


__all__ = [
    "CATEGORY_SCHEMA_MAP",
    "ValidationIssue",
    "pricing_details_to_jsonb_text",
    "validate_category_metadata",
    "validate_for_publish",
    "validate_pricing_details",
    "validate_subtype_for_category",
]
