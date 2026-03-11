from typing import Dict, List, Optional

from orbat.orbat_engine.domain.entities import Unit
from orbat.orbat_engine.ports.repositories import UnitRepository


class InMemoryUnitRepository(UnitRepository):
    def __init__(self) -> None:
        self._units: Dict[str, Unit] = {}

    def save(self, unit: Unit) -> Unit:
        self._units[unit.id] = unit
        return unit

    def get(self, unit_id: str) -> Optional[Unit]:
        return self._units.get(unit_id)

    def list_all(self) -> List[Unit]:
        return list(self._units.values())

    def list_by_parent(self, parent_id: Optional[str]) -> List[Unit]:
        return [u for u in self._units.values() if u.parent_id == parent_id]

    def snapshot(self) -> Dict[str, Unit]:
        return dict(self._units)

    def delete(self, unit_id: str) -> bool:
        if unit_id not in self._units:
            return False
        del self._units[unit_id]
        return True
