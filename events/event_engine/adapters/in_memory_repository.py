from datetime import datetime
from typing import Dict, List, Optional, Sequence, Tuple

from events.event_engine.domain.entities import CanonicalEvent
from events.event_engine.ports.repositories import EventRepository


class InMemoryEventRepository(EventRepository):
    def __init__(self) -> None:
        self._events: List[CanonicalEvent] = []
        self._dedupe: set[Tuple[str, str, str]] = set()

    def ingest(self, event: CanonicalEvent) -> bool:
        key = (event.source_system, event.source_ref, event.occurred_at.isoformat())
        if key in self._dedupe:
            return False
        self._dedupe.add(key)
        self._events.append(event)
        self._events.sort(key=lambda item: item.occurred_at, reverse=True)
        return True

    def query_timeline(
        self,
        unit: Optional[str],
        from_ts: Optional[datetime],
        to_ts: Optional[datetime],
        sources: Sequence[str],
        limit: int,
        cursor: int,
    ) -> List[CanonicalEvent]:
        items = self._events

        if unit:
            items = [event for event in items if unit in event.unit_refs]
        if from_ts:
            items = [event for event in items if event.occurred_at >= from_ts]
        if to_ts:
            items = [event for event in items if event.occurred_at <= to_ts]
        if sources:
            source_set = set(sources)
            items = [event for event in items if event.source_system in source_set]

        start = max(0, cursor)
        end = start + max(1, min(limit, 500))
        return items[start:end]

    def count(self) -> int:
        return len(self._events)
