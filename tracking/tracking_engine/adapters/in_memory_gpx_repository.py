from typing import Dict, Optional

from tracking.tracking_engine.domain.gpx_entities import GpxImport
from tracking.tracking_engine.ports.gpx_repository import GpxImportRepository


class InMemoryGpxImportRepository(GpxImportRepository):
    def __init__(self) -> None:
        self._imports: Dict[str, GpxImport] = {}

    def save(self, gpx_import: GpxImport) -> GpxImport:
        self._imports[gpx_import.import_id] = gpx_import
        return gpx_import

    def get(self, import_id: str) -> Optional[GpxImport]:
        return self._imports.get(import_id)
