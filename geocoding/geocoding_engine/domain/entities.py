from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional


@dataclass
class GeocodeResponse:
    id: str
    lat: Optional[float]
    lon: Optional[float]
    provider: str
    address_text: Optional[str]
    components: Dict[str, Any]
    confidence: float
    cached: bool
    ttl_s: int
    resolved_at: datetime


@dataclass
class UnitDraft:
    id: str
    name: str
    parent_unit_id: Optional[str]
    lat: float
    lon: float
    address_text: Optional[str]
    geocode_confidence: Optional[float]
    status: str
