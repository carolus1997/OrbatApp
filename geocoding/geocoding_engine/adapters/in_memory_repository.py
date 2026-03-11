from typing import Dict, Optional

from geocoding.geocoding_engine.ports.interfaces import UnitDraftRepository


class InMemoryUnitDraftRepository(UnitDraftRepository):
    def __init__(self) -> None:
        self._drafts: Dict[str, dict] = {}

    def save(self, draft_id: str, payload: dict) -> dict:
        self._drafts[draft_id] = payload
        return payload

    def get(self, draft_id: str) -> Optional[dict]:
        return self._drafts.get(draft_id)
