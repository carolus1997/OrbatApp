from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional

from orbat.orbat_engine.domain.entities import Unit
from orbat.orbat_engine.ports.repositories import UnitRepository


class OrbatDomainError(ValueError):
    pass


@dataclass
class CreateUnitInput:
    id: str
    name: str
    type: str
    echelon: str
    status: str
    parent_id: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None


@dataclass
class UpdateUnitInput:
    unit_id: str
    name: Optional[str] = None
    type: Optional[str] = None
    echelon: Optional[str] = None
    status: Optional[str] = None
    parent_id: Optional[str] = None


class OrbatService:
    def __init__(self, repository: UnitRepository) -> None:
        self._repository = repository

    def create_unit(self, data: CreateUnitInput) -> Unit:
        if self._repository.get(data.id):
            raise OrbatDomainError(f"Unit '{data.id}' already exists")

        if data.parent_id and not self._repository.get(data.parent_id):
            raise OrbatDomainError(f"Parent unit '{data.parent_id}' not found")

        unit = Unit(
            id=data.id,
            name=data.name,
            type=data.type,
            echelon=data.echelon,
            status=data.status,
            parent_id=data.parent_id,
            valid_from=data.valid_from,
            valid_to=data.valid_to,
        )

        self._assert_no_cycle(unit)
        return self._repository.save(unit)

    def get_unit(self, unit_id: str) -> Optional[Unit]:
        return self._repository.get(unit_id)

    def get_subtree(self, root_id: str) -> Dict[str, object]:
        root = self._repository.get(root_id)
        if not root:
            raise OrbatDomainError(f"Unit '{root_id}' not found")
        return self._build_tree(root)

    def list_units(self) -> List[Unit]:
        return self._repository.list_all()

    def create_orbat(self, units: List[CreateUnitInput]) -> Dict[str, object]:
        created_ids: List[str] = []
        for item in units:
            self.create_unit(item)
            created_ids.append(item.id)

        roots = self._repository.list_by_parent(None)
        return {
            "created": created_ids,
            "root_count": len(roots),
            "roots": [self._build_tree(unit) for unit in roots],
        }

    def update_unit(self, data: UpdateUnitInput) -> Unit:
        current = self._repository.get(data.unit_id)
        if not current:
            raise OrbatDomainError(f"Unit '{data.unit_id}' not found")

        parent_id = current.parent_id if data.parent_id is None else data.parent_id
        if parent_id == data.unit_id:
            raise OrbatDomainError("Unit cannot be its own parent")
        if parent_id and not self._repository.get(parent_id):
            raise OrbatDomainError(f"Parent unit '{parent_id}' not found")

        updated = Unit(
            id=current.id,
            name=data.name if data.name is not None else current.name,
            type=data.type if data.type is not None else current.type,
            echelon=data.echelon if data.echelon is not None else current.echelon,
            status=data.status if data.status is not None else current.status,
            parent_id=parent_id,
            valid_from=current.valid_from,
            valid_to=current.valid_to,
        )
        self._assert_no_cycle(updated)
        return self._repository.save(updated)

    def delete_unit(self, unit_id: str) -> None:
        unit = self._repository.get(unit_id)
        if not unit:
            raise OrbatDomainError(f"Unit '{unit_id}' not found")
        children = self._repository.list_by_parent(unit_id)
        if children:
            raise OrbatDomainError("Unit has children and cannot be deleted")
        if not self._repository.delete(unit_id):
            raise OrbatDomainError(f"Unit '{unit_id}' could not be deleted")

    def _assert_no_cycle(self, candidate: Unit) -> None:
        seen = {candidate.id}
        current_parent = candidate.parent_id
        snapshot = self._repository.snapshot()

        while current_parent:
            if current_parent in seen:
                raise OrbatDomainError("Hierarchy cycle detected")
            seen.add(current_parent)
            parent = snapshot.get(current_parent)
            if not parent:
                break
            current_parent = parent.parent_id

    def _build_tree(self, unit: Unit) -> Dict[str, object]:
        children = self._repository.list_by_parent(unit.id)
        return {
            "id": unit.id,
            "name": unit.name,
            "type": unit.type,
            "echelon": unit.echelon,
            "status": unit.status,
            "parent_id": unit.parent_id,
            "children": [self._build_tree(child) for child in children],
        }
