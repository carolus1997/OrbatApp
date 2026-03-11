from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import uuid4

from tracking.tracking_engine.domain.entities import TrackPoint, TrackState
from tracking.tracking_engine.ports.repositories import TrackRepository, TrackStateRepository


class TrackingDomainError(ValueError):
    pass


@dataclass
class IngestPositionInput:
    entity_id: str
    ts: datetime
    lat: float
    lon: float
    accuracy: float
    source: str
    alt: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None


class TrackingService:
    def __init__(self, track_repository: TrackRepository, state_repository: TrackStateRepository) -> None:
        self._track_repository = track_repository
        self._state_repository = state_repository

    def ingest(self, data: IngestPositionInput) -> Dict[str, object]:
        self._validate(data)

        point = TrackPoint(
            id=str(uuid4()),
            entity_id=data.entity_id,
            ts=data.ts,
            lat=data.lat,
            lon=data.lon,
            accuracy=data.accuracy,
            source=data.source,
            alt=data.alt,
            speed=data.speed,
            heading=data.heading,
        )
        self._track_repository.append(point)

        lag_ms = max(0, int((point.ingest_ts - point.ts).total_seconds() * 1000))
        freshness = self._resolve_freshness(point.ts, point.ingest_ts)
        state = TrackState(
            entity_id=point.entity_id,
            last_point_id=point.id,
            freshness=freshness,
            updated_at=point.ingest_ts,
            lag_ms=lag_ms,
        )
        self._state_repository.save(state)

        return {
            "point": point,
            "state": state,
            "ingest_to_publish_ms": lag_ms,
        }

    def get_positions(self, entity_id: str, limit: int = 100) -> Dict[str, object]:
        latest = self._track_repository.latest(entity_id)
        trail = self._track_repository.trail(entity_id, limit=limit)
        state = self._state_repository.get(entity_id)
        return {
            "latest": latest,
            "trail": trail,
            "state": state,
        }

    def _validate(self, data: IngestPositionInput) -> None:
        if not data.entity_id.strip():
            raise TrackingDomainError("entity_id is required")
        if data.source not in {"bodycam", "cctv", "network", "telephony", "manual"}:
            raise TrackingDomainError("source is not supported")
        if not (-90 <= data.lat <= 90):
            raise TrackingDomainError("lat must be between -90 and 90")
        if not (-180 <= data.lon <= 180):
            raise TrackingDomainError("lon must be between -180 and 180")
        if data.accuracy < 0:
            raise TrackingDomainError("accuracy must be >= 0")
        if data.ts.tzinfo is None:
            raise TrackingDomainError("ts must include timezone")

    def _resolve_freshness(self, point_ts: datetime, now_utc: datetime) -> str:
        delta = now_utc - point_ts.astimezone(timezone.utc)
        if delta <= timedelta(seconds=1):
            return "fresh"
        if delta <= timedelta(seconds=5):
            return "stale"
        return "lost"
