from dataclasses import dataclass
from typing import Dict, Optional
from uuid import uuid4

from geocoding.geocoding_engine.domain.entities import UnitDraft
from geocoding.geocoding_engine.ports.interfaces import ReverseGeocodingProvider, UnitDraftRepository


class GeocodingDomainError(ValueError):
    pass


@dataclass
class UnitDraftInput:
    name: str
    parent_unit_id: Optional[str]
    lat: float
    lon: float
    address_text: Optional[str] = None
    geocode_confidence: Optional[float] = None


@dataclass
class TrackingIngestDraftInput:
    unit_id: Optional[str]
    lat: float
    lon: float
    address_text: Optional[str] = None
    geocode_confidence: Optional[float] = None
    provider_status: str = "ok"


class GeocodingService:
    def __init__(self, provider: ReverseGeocodingProvider, drafts: UnitDraftRepository) -> None:
        self._provider = provider
        self._drafts = drafts

    def reverse(self, lat: float, lon: float, locale: str = "es") -> dict:
        if not (-90 <= lat <= 90):
            raise GeocodingDomainError("lat must be between -90 and 90")
        if not (-180 <= lon <= 180):
            raise GeocodingDomainError("lon must be between -180 and 180")

        result = self._provider.reverse(lat=lat, lon=lon, locale=locale)
        return {
            "id": result.id,
            "lat": result.lat,
            "lon": result.lon,
            "provider": result.provider,
            "address_text": result.address_text,
            "components": result.components,
            "confidence": result.confidence,
            "cached": result.cached,
            "ttl_s": result.ttl_s,
            "resolved_at": result.resolved_at.isoformat(),
        }

    def forward(self, query: str, locale: str = "es") -> dict:
        if not query or not query.strip():
            raise GeocodingDomainError("query is required")
        result = self._provider.forward(query=query.strip(), locale=locale)
        return {
            "id": result.id,
            "lat": result.lat,
            "lon": result.lon,
            "provider": result.provider,
            "address_text": result.address_text,
            "components": result.components,
            "confidence": result.confidence,
            "cached": result.cached,
            "ttl_s": result.ttl_s,
            "resolved_at": result.resolved_at.isoformat(),
            "query": query.strip(),
        }

    def create_draft(self, payload: UnitDraftInput) -> dict:
        if not payload.name.strip():
            raise GeocodingDomainError("name is required")

        draft = UnitDraft(
            id=str(uuid4()),
            name=payload.name,
            parent_unit_id=payload.parent_unit_id,
            lat=payload.lat,
            lon=payload.lon,
            address_text=payload.address_text,
            geocode_confidence=payload.geocode_confidence,
            status="draft",
        )

        saved = self._drafts.save(
            draft.id,
            {
                "id": draft.id,
                "name": draft.name,
                "parent_unit_id": draft.parent_unit_id,
                "lat": draft.lat,
                "lon": draft.lon,
                "address_text": draft.address_text,
                "geocode_confidence": draft.geocode_confidence,
                "status": draft.status,
            },
        )
        return saved

    def create_tracking_ingest_draft(self, payload: TrackingIngestDraftInput) -> dict:
        self._validate_coordinates(payload.lat, payload.lon)
        if payload.geocode_confidence is not None and not (0 <= payload.geocode_confidence <= 1):
            raise GeocodingDomainError("geocode_confidence must be between 0 and 1")

        draft_id = str(uuid4())
        return self._drafts.save(
            draft_id,
            {
                "id": draft_id,
                "flow_type": "tracking_ingest",
                "unit_id": payload.unit_id,
                "lat": payload.lat,
                "lon": payload.lon,
                "address_text": payload.address_text,
                "geocode_confidence": payload.geocode_confidence,
                "provider_status": payload.provider_status,
                "status": "draft",
            },
        )

    def get_draft(self, draft_id: str) -> Optional[Dict[str, object]]:
        return self._drafts.get(draft_id)

    @staticmethod
    def _validate_coordinates(lat: float, lon: float) -> None:
        if not (-90 <= lat <= 90):
            raise GeocodingDomainError("lat must be between -90 and 90")
        if not (-180 <= lon <= 180):
            raise GeocodingDomainError("lon must be between -180 and 180")
