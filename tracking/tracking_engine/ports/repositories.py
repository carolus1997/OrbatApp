from abc import ABC, abstractmethod
from typing import List, Optional

from tracking.tracking_engine.domain.entities import TrackPoint, TrackState


class TrackRepository(ABC):
    @abstractmethod
    def append(self, point: TrackPoint) -> None:
        raise NotImplementedError

    @abstractmethod
    def latest(self, entity_id: str) -> Optional[TrackPoint]:
        raise NotImplementedError

    @abstractmethod
    def trail(self, entity_id: str, limit: int = 100) -> List[TrackPoint]:
        raise NotImplementedError


class TrackStateRepository(ABC):
    @abstractmethod
    def save(self, state: TrackState) -> TrackState:
        raise NotImplementedError

    @abstractmethod
    def get(self, entity_id: str) -> Optional[TrackState]:
        raise NotImplementedError
