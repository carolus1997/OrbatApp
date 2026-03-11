import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from events.event_engine.domain.entities import CanonicalEvent, TimelineItem
from events.event_engine.ports.repositories import EventRepository


class EventDomainError(ValueError):
    pass


@dataclass
class TimelineQuery:
    unit: Optional[str] = None
    from_ts: Optional[datetime] = None
    to_ts: Optional[datetime] = None
    sources: Optional[List[str]] = None
    limit: int = 100
    cursor: int = 0


class EventService:
    ALLOWED_TYPES = {
        "POSITION_UPDATED",
        "MEDIA_EVENT",
        "NETWORK_OBSERVATION",
        "CALL_EVENT",
        "UNIT_STATUS_CHANGED",
        "ALERT_RAISED",
    }

    ALLOWED_SOURCES = {"bodycam", "cctv", "network", "telephony", "gnss", "manual"}

    def __init__(self, repository: EventRepository) -> None:
        self._repository = repository

    def ingest(self, payload: Dict[str, Any], source: str) -> Dict[str, Any]:
        event = self._to_event(payload)
        if source and source != event.source_system:
            raise EventDomainError("source path does not match payload source_system")

        stored = self._repository.ingest(event)
        return {
            "accepted": stored,
            "deduplicated": not stored,
            "event_id": event.event_id,
        }

    def timeline(self, query: TimelineQuery) -> Dict[str, Any]:
        items = self._repository.query_timeline(
            unit=query.unit,
            from_ts=query.from_ts,
            to_ts=query.to_ts,
            sources=query.sources or [],
            limit=query.limit,
            cursor=query.cursor,
        )

        timeline_items = [self._to_timeline_item(event) for event in items]
        next_cursor = query.cursor + len(items) if len(items) == query.limit else None

        return {
            "items": [
                {
                    "id": item.id,
                    "event_id": item.event_id,
                    "ts": item.ts.isoformat(),
                    "unit_id": item.unit_id,
                    "source_system": item.source_system,
                    "event_type": item.event_type,
                    "severity": item.severity,
                    "summary": item.summary,
                    "geo": item.geo,
                }
                for item in timeline_items
            ],
            "cursor": query.cursor,
            "next_cursor": next_cursor,
            "count": len(timeline_items),
            "total_loaded": self._repository.count(),
        }

    def ingest_demo_events(self, demo_root: Path) -> int:
        loaded = 0
        for event_file in demo_root.glob("*/events.json"):
            try:
                entries = json.loads(event_file.read_text(encoding="utf-8"))
            except Exception:
                continue
            for payload in entries:
                try:
                    self.ingest(payload, source=payload.get("source_system", ""))
                    loaded += 1
                except EventDomainError:
                    continue
        return loaded

    def _to_event(self, payload: Dict[str, Any]) -> CanonicalEvent:
        required = [
            "event_id",
            "schema_version",
            "event_type",
            "occurred_at",
            "ingested_at",
            "source_system",
            "source_ref",
            "correlation_id",
            "trace_id",
            "classification",
            "operation_id",
            "unit_refs",
            "entity_refs",
            "payload",
        ]
        missing = [key for key in required if key not in payload]
        if missing:
            raise EventDomainError(f"missing fields: {', '.join(missing)}")

        if payload["event_type"] not in self.ALLOWED_TYPES:
            raise EventDomainError("event_type not allowed in v1")
        if payload["source_system"] not in self.ALLOWED_SOURCES:
            raise EventDomainError("source_system not allowed in v1")
        if not str(payload["schema_version"]).startswith("1."):
            raise EventDomainError("schema_version must be 1.x")

        occurred_at = self._parse_utc(payload["occurred_at"])
        ingested_at = self._parse_utc(payload["ingested_at"])

        return CanonicalEvent(
            event_id=str(payload["event_id"]),
            schema_version=str(payload["schema_version"]),
            event_type=str(payload["event_type"]),
            occurred_at=occurred_at,
            ingested_at=ingested_at,
            source_system=str(payload["source_system"]),
            source_ref=str(payload["source_ref"]),
            correlation_id=str(payload["correlation_id"]),
            trace_id=str(payload["trace_id"]),
            classification=str(payload["classification"]),
            operation_id=str(payload["operation_id"]),
            unit_refs=list(payload["unit_refs"]),
            entity_refs=list(payload["entity_refs"]),
            geo=payload.get("geo"),
            payload=dict(payload["payload"]),
        )

    def _to_timeline_item(self, event: CanonicalEvent) -> TimelineItem:
        payload_kind = str(event.payload.get("kind", "unknown"))
        summary = f"{event.event_type} ({payload_kind})"
        severity = None
        attrs = event.payload.get("attributes") if isinstance(event.payload, dict) else None
        if isinstance(attrs, dict):
            raw = attrs.get("severity")
            severity = str(raw) if raw is not None else None
        return TimelineItem(
            id=f"timeline-{event.event_id}",
            event_id=event.event_id,
            ts=event.occurred_at,
            unit_id=event.unit_refs[0] if event.unit_refs else None,
            source_system=event.source_system,
            event_type=event.event_type,
            severity=severity,
            summary=summary,
            geo=event.geo,
        )

    @staticmethod
    def _parse_utc(raw: str) -> datetime:
        normalized = raw.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            raise EventDomainError("timestamps must include timezone")
        return parsed.astimezone(timezone.utc)
