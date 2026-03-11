from abc import ABC, abstractmethod
from typing import Optional

from geocoding.geocoding_engine.domain.entities import GeocodeResponse


class ReverseGeocodingProvider(ABC):
    @abstractmethod
    def reverse(self, lat: float, lon: float, locale: str = "es") -> GeocodeResponse:
        raise NotImplementedError

    @abstractmethod
    def forward(self, query: str, locale: str = "es") -> GeocodeResponse:
        raise NotImplementedError


class UnitDraftRepository(ABC):
    @abstractmethod
    def save(self, draft_id: str, payload: dict) -> dict:
        raise NotImplementedError

    @abstractmethod
    def get(self, draft_id: str) -> Optional[dict]:
        raise NotImplementedError
