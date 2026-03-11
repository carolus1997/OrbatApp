from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class TrackPoint:
    id: str
    entity_id: str
    ts: datetime
    lat: float
    lon: float
    accuracy: float
    source: str
    ingest_ts: datetime = field(default_factory=utc_now)
    alt: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None


@dataclass
class TrackState:
    entity_id: str
    last_point_id: str
    freshness: str
    updated_at: datetime
    lag_ms: int
