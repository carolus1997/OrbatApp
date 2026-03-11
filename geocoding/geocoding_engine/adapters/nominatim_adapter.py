from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from uuid import uuid4

import httpx

from geocoding.geocoding_engine.domain.entities import GeocodeResponse
from geocoding.geocoding_engine.ports.interfaces import ReverseGeocodingProvider


class NominatimAdapter(ReverseGeocodingProvider):
    def __init__(self) -> None:
        self._cache: Dict[Tuple[float, float, str], GeocodeResponse] = {}
        self._query_cache: Dict[Tuple[str, str], GeocodeResponse] = {}
        self._ttl_seconds = 900

    def reverse(self, lat: float, lon: float, locale: str = "es") -> GeocodeResponse:
        key = (round(lat, 4), round(lon, 4), locale)
        cached = self._cache.get(key)
        if cached:
            return GeocodeResponse(
                id=str(uuid4()),
                lat=lat,
                lon=lon,
                provider=cached.provider,
                address_text=cached.address_text,
                components=cached.components,
                confidence=cached.confidence,
                cached=True,
                ttl_s=self._ttl_seconds,
                resolved_at=datetime.now(timezone.utc),
            )

        try:
            with httpx.Client(timeout=2.8, headers={"User-Agent": "orbat-platform/1.0"}) as client:
                response = client.get(
                    "https://nominatim.openstreetmap.org/reverse",
                    params={
                        "lat": lat,
                        "lon": lon,
                        "format": "jsonv2",
                        "accept-language": locale,
                        "zoom": 18,
                        "addressdetails": 1,
                    },
                )
                response.raise_for_status()
                data = response.json()
                geocode = GeocodeResponse(
                    id=str(uuid4()),
                    lat=lat,
                    lon=lon,
                    provider="nominatim",
                    address_text=data.get("display_name"),
                    components=data.get("address", {}),
                    confidence=0.85,
                    cached=False,
                    ttl_s=self._ttl_seconds,
                    resolved_at=datetime.now(timezone.utc),
                )
        except Exception:
            geocode = GeocodeResponse(
                id=str(uuid4()),
                lat=lat,
                lon=lon,
                provider="nominatim",
                address_text=None,
                components={},
                confidence=0.0,
                cached=False,
                ttl_s=self._ttl_seconds,
                resolved_at=datetime.now(timezone.utc),
            )

        self._cache[key] = geocode
        return geocode

    def forward(self, query: str, locale: str = "es") -> GeocodeResponse:
        normalized = query.strip()
        key = (normalized.lower(), locale)
        cached = self._query_cache.get(key)
        if cached:
            return GeocodeResponse(
                id=str(uuid4()),
                lat=cached.lat,
                lon=cached.lon,
                provider=cached.provider,
                address_text=cached.address_text,
                components=cached.components,
                confidence=cached.confidence,
                cached=True,
                ttl_s=self._ttl_seconds,
                resolved_at=datetime.now(timezone.utc),
            )

        try:
            with httpx.Client(timeout=2.8, headers={"User-Agent": "orbat-platform/1.0"}) as client:
                response = client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={
                        "q": normalized,
                        "format": "jsonv2",
                        "accept-language": locale,
                        "limit": 1,
                        "addressdetails": 1,
                    },
                )
                response.raise_for_status()
                payload = response.json()
                first = payload[0] if payload else {}
                lat = float(first["lat"]) if first.get("lat") is not None else None
                lon = float(first["lon"]) if first.get("lon") is not None else None
                geocode = GeocodeResponse(
                    id=str(uuid4()),
                    lat=lat,
                    lon=lon,
                    provider="nominatim",
                    address_text=first.get("display_name"),
                    components=first.get("address", {}),
                    confidence=0.8 if lat is not None and lon is not None else 0.0,
                    cached=False,
                    ttl_s=self._ttl_seconds,
                    resolved_at=datetime.now(timezone.utc),
                )
        except Exception:
            geocode = GeocodeResponse(
                id=str(uuid4()),
                lat=None,
                lon=None,
                provider="nominatim",
                address_text=None,
                components={},
                confidence=0.0,
                cached=False,
                ttl_s=self._ttl_seconds,
                resolved_at=datetime.now(timezone.utc),
            )

        self._query_cache[key] = geocode
        return geocode
