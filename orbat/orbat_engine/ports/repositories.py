from abc import ABC, abstractmethod
from typing import Dict, List, Optional

from orbat.orbat_engine.domain.entities import Unit


class UnitRepository(ABC):
    @abstractmethod
    def save(self, unit: Unit) -> Unit:
        raise NotImplementedError

    @abstractmethod
    def get(self, unit_id: str) -> Optional[Unit]:
        raise NotImplementedError

    @abstractmethod
    def list_all(self) -> List[Unit]:
        raise NotImplementedError

    @abstractmethod
    def list_by_parent(self, parent_id: Optional[str]) -> List[Unit]:
        raise NotImplementedError

    @abstractmethod
    def snapshot(self) -> Dict[str, Unit]:
        raise NotImplementedError

    @abstractmethod
    def delete(self, unit_id: str) -> bool:
        raise NotImplementedError
