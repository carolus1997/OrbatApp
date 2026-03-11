from abc import ABC, abstractmethod
from typing import Optional

from tracking.tracking_engine.domain.gpx_entities import GpxImport


class GpxImportRepository(ABC):
    @abstractmethod
    def save(self, gpx_import: GpxImport) -> GpxImport:
        raise NotImplementedError

    @abstractmethod
    def get(self, import_id: str) -> Optional[GpxImport]:
        raise NotImplementedError
