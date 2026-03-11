from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class CanonicalEvent:
    event_id: str
    schema_version: str
    event_type: str
    occurred_at: datetime
    ingested_at: datetime
    source_system: str
    source_ref: str
    correlation_id: str
    trace_id: str
    classification: str
    operation_id: str
    unit_refs: List[str]
    entity_refs: List[Dict[str, Any]]
    geo: Optional[Dict[str, Any]]
    payload: Dict[str, Any]


@dataclass
class TimelineItem:
    id: str
    event_id: str
    ts: datetime
    unit_id: Optional[str]
    source_system: str
    event_type: str
    severity: Optional[str]
    summary: str
    geo: Optional[Dict[str, Any]]
