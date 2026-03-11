from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional, Sequence

from events.event_engine.domain.entities import CanonicalEvent


class EventRepository(ABC):
    @abstractmethod
    def ingest(self, event: CanonicalEvent) -> bool:
        raise NotImplementedError

    @abstractmethod
    def query_timeline(
        self,
        unit: Optional[str],
        from_ts: Optional[datetime],
        to_ts: Optional[datetime],
        sources: Sequence[str],
        limit: int,
        cursor: int,
    ) -> List[CanonicalEvent]:
        raise NotImplementedError

    @abstractmethod
    def count(self) -> int:
        raise NotImplementedError
