from collections import defaultdict
from typing import Dict, List, Optional

from tracking.tracking_engine.domain.entities import TrackPoint, TrackState
from tracking.tracking_engine.ports.repositories import TrackRepository, TrackStateRepository


class InMemoryTrackRepository(TrackRepository):
    def __init__(self) -> None:
        self._points: Dict[str, List[TrackPoint]] = defaultdict(list)

    def append(self, point: TrackPoint) -> None:
        self._points[point.entity_id].append(point)
        self._points[point.entity_id].sort(key=lambda p: p.ts)

    def latest(self, entity_id: str) -> Optional[TrackPoint]:
        points = self._points.get(entity_id, [])
        return points[-1] if points else None

    def trail(self, entity_id: str, limit: int = 100) -> List[TrackPoint]:
        return self._points.get(entity_id, [])[-limit:]


class InMemoryTrackStateRepository(TrackStateRepository):
    def __init__(self) -> None:
        self._states: Dict[str, TrackState] = {}

    def save(self, state: TrackState) -> TrackState:
        self._states[state.entity_id] = state
        return state

    def get(self, entity_id: str) -> Optional[TrackState]:
        return self._states.get(entity_id)
