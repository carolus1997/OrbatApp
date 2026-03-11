from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from geo.geo_engine.application.projection import GeoFeature, build_feature_collection
from orbat.orbat_engine.domain.entities import Unit
from tracking.tracking_engine.domain.entities import TrackPoint


@dataclass(frozen=True)
class BBox:
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    def contains(self, lat: float, lon: float) -> bool:
        return self.min_lat <= lat <= self.max_lat and self.min_lon <= lon <= self.max_lon


@dataclass
class _ZoneCacheEntry:
    ring_lonlat: List[List[float]]
    member_ids: Tuple[str, ...]
    centroid_lonlat: Tuple[float, float]
    area_m2: float
    version: int
    generated_at_ms: int


class GeoDeploymentZoneService:
    """
    Servicio de zonas de despliegue:
    - Construye poligonos no circulares para nodos ORBAT con miembros georreferenciados.
    - Incluye fallback para 0/1/2 puntos.
    - Aplica suavizado y estabilizacion temporal anti-jitter.
    """

    def __init__(self) -> None:
        self._cache: Dict[str, _ZoneCacheEntry] = {}
        self._min_recalc_interval_ms = 1200
        self._min_delta_m = 12.0

    def build_features(
        self,
        units: Iterable[Unit],
        latest_positions: Dict[str, TrackPoint],
        freshness_by_unit: Optional[Dict[str, str]],
        zoom: int,
        bbox: Optional[BBox] = None,
    ) -> Dict[str, object]:
        units_list = list(units)
        units_by_id = {unit.id: unit for unit in units_list}
        children_map: Dict[str, List[str]] = {}
        for unit in units_list:
            if unit.parent_id:
                children_map.setdefault(unit.parent_id, []).append(unit.id)

        features: List[GeoFeature] = []
        freshness = freshness_by_unit or {}

        link_features = self._build_orbat_links(
            units_by_id=units_by_id,
            latest_positions=latest_positions,
            bbox=bbox,
        )
        features.extend(link_features)
        for unit in units_list:
            point = latest_positions.get(unit.id)
            if not point:
                continue
            if bbox and not bbox.contains(point.lat, point.lon):
                continue
            features.append(
                GeoFeature(
                    type="Feature",
                    geometry={"type": "Point", "coordinates": [point.lon, point.lat]},
                    properties={
                        "layer": "units-point",
                        "unit_id": unit.id,
                        "unit_name": unit.name,
                        "unit_type": unit.type,
                        "echelon": unit.echelon,
                        "source": point.source,
                        "freshness": freshness.get(unit.id, "unknown"),
                    },
                )
            )

        return build_feature_collection(features)

    def _build_orbat_links(
        self,
        units_by_id: Dict[str, Unit],
        latest_positions: Dict[str, TrackPoint],
        bbox: Optional[BBox],
    ) -> List[GeoFeature]:
        links: List[GeoFeature] = []
        for unit in units_by_id.values():
            if not unit.parent_id:
                continue
            parent_pos = latest_positions.get(unit.parent_id)
            child_pos = latest_positions.get(unit.id)
            if not parent_pos or not child_pos:
                continue
            if bbox and not (bbox.contains(parent_pos.lat, parent_pos.lon) or bbox.contains(child_pos.lat, child_pos.lon)):
                continue
            links.append(
                GeoFeature(
                    type="Feature",
                    geometry={
                        "type": "LineString",
                        "coordinates": [
                            [parent_pos.lon, parent_pos.lat],
                            [child_pos.lon, child_pos.lat],
                        ],
                    },
                    properties={
                        "layer": "orbat-link",
                        "parent_id": unit.parent_id,
                        "child_id": unit.id,
                        "child_echelon": unit.echelon,
                    },
                )
            )
        return links

    def compute_zone_for_node(
        self,
        node_id: str,
        units_by_id: Dict[str, Unit],
        children_map: Dict[str, List[str]],
        latest_positions: Dict[str, TrackPoint],
        freshness_by_unit: Dict[str, str],
        include_members: bool = True,
    ) -> Dict[str, object]:
        unit = units_by_id.get(node_id)
        if not unit:
            return {}

        member_ids = self._descendant_member_ids(node_id, children_map)
        positioned_member_ids = [
            member_id
            for member_id in member_ids
            if member_id in latest_positions and freshness_by_unit.get(member_id, "unknown") != "lost"
        ]
        points = [latest_positions[mid] for mid in positioned_member_ids]
        now_ms = int(time.time() * 1000)
        zone_id = f"zone-{node_id}"

        if not points:
            return {
                "zone_id": zone_id,
                "orbat_node_id": node_id,
                "geometry": None,
                "zone_version": self._cache.get(node_id).version if node_id in self._cache else 0,
                "generated_at": self._iso_now(),
                "area_m2": 0.0,
                "member_count": 0,
                "member_ids": positioned_member_ids if include_members else [],
                "quality_score": 0.0,
                "source_window": {"from": None, "to": None},
                "state": "fallback",
                "reason": "no_georeferenced_children",
            }

        ring_lonlat, centroid_lonlat, area_m2, fallback_state = self._build_zone_ring(points, unit.echelon)
        member_ids_tuple = tuple(sorted(positioned_member_ids))
        previous = self._cache.get(node_id)

        state = fallback_state
        zone_version = 1
        if previous:
            zone_version = previous.version
            can_reuse = (
                (now_ms - previous.generated_at_ms) < self._min_recalc_interval_ms
                and previous.member_ids == member_ids_tuple
                and self._distance_m(previous.centroid_lonlat, centroid_lonlat) < self._min_delta_m
            )
            if can_reuse:
                ring_lonlat = previous.ring_lonlat
                centroid_lonlat = previous.centroid_lonlat
                area_m2 = previous.area_m2
                state = "stable"
            else:
                state = "updating"
                zone_version = previous.version + 1

        self._cache[node_id] = _ZoneCacheEntry(
            ring_lonlat=ring_lonlat,
            member_ids=member_ids_tuple,
            centroid_lonlat=centroid_lonlat,
            area_m2=area_m2,
            version=zone_version,
            generated_at_ms=now_ms,
        )

        timestamps = [point.ts for point in points]
        source_window = {
            "from": min(timestamps).isoformat() if timestamps else None,
            "to": max(timestamps).isoformat() if timestamps else None,
        }

        quality_score = self._quality_score(len(points), area_m2, fallback_state)
        return {
            "zone_id": zone_id,
            "orbat_node_id": node_id,
            "geometry": {"type": "Polygon", "coordinates": [ring_lonlat]},
            "zone_version": zone_version,
            "generated_at": self._iso_now(),
            "area_m2": round(area_m2, 2),
            "member_count": len(positioned_member_ids),
            "member_ids": positioned_member_ids if include_members else [],
            "quality_score": quality_score,
            "source_window": source_window,
            "state": state,
        }

    @staticmethod
    def _descendant_member_ids(node_id: str, children_map: Dict[str, List[str]]) -> List[str]:
        stack = list(children_map.get(node_id, []))
        descendants: List[str] = []
        while stack:
            child_id = stack.pop()
            descendants.append(child_id)
            stack.extend(children_map.get(child_id, []))
        return descendants

    def _build_zone_ring(
        self,
        points: Sequence[TrackPoint],
        echelon: str,
    ) -> Tuple[List[List[float]], Tuple[float, float], float, str]:
        centroid_lat = sum(point.lat for point in points) / len(points)
        centroid_lon = sum(point.lon for point in points) / len(points)
        cos_lat = max(0.2, math.cos(math.radians(centroid_lat)))

        xy_points = [self._lonlat_to_xy(point.lon, point.lat, centroid_lon, centroid_lat, cos_lat) for point in points]
        centroid_xy = (
            sum(point[0] for point in xy_points) / len(xy_points),
            sum(point[1] for point in xy_points) / len(xy_points),
        )

        if len(xy_points) == 1:
            ring_xy = self._ellipse_ring(centroid_xy, radius_x=70.0, radius_y=50.0, steps=24)
            area = abs(self._polygon_area(ring_xy))
            return self._xy_ring_to_lonlat(ring_xy, (centroid_lon, centroid_lat), cos_lat), (centroid_lon, centroid_lat), area, "fallback"

        if len(xy_points) == 2:
            width = 40.0 if echelon in {"company", "platoon"} else 25.0
            ring_xy = self._capsule_ring(xy_points[0], xy_points[1], width=width, segments=10)
            area = abs(self._polygon_area(ring_xy))
            return self._xy_ring_to_lonlat(ring_xy, (centroid_lon, centroid_lat), cos_lat), (centroid_lon, centroid_lat), area, "fallback"

        hull = self._convex_hull(xy_points)
        if len(hull) < 3:
            ring_xy = self._ellipse_ring(centroid_xy, radius_x=80.0, radius_y=55.0, steps=24)
            area = abs(self._polygon_area(ring_xy))
            return self._xy_ring_to_lonlat(ring_xy, (centroid_lon, centroid_lat), cos_lat), (centroid_lon, centroid_lat), area, "degraded"

        smooth = self._chaikin_closed(hull, iterations=2)
        if smooth[0] != smooth[-1]:
            smooth.append(smooth[0])
        area = abs(self._polygon_area(smooth))
        return self._xy_ring_to_lonlat(smooth, (centroid_lon, centroid_lat), cos_lat), (centroid_lon, centroid_lat), area, "stable"

    @staticmethod
    def _convex_hull(points: Sequence[Tuple[float, float]]) -> List[Tuple[float, float]]:
        unique = sorted(set(points))
        if len(unique) <= 1:
            return list(unique)

        def cross(o: Tuple[float, float], a: Tuple[float, float], b: Tuple[float, float]) -> float:
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

        lower: List[Tuple[float, float]] = []
        for point in unique:
            while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
                lower.pop()
            lower.append(point)

        upper: List[Tuple[float, float]] = []
        for point in reversed(unique):
            while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
                upper.pop()
            upper.append(point)

        hull = lower[:-1] + upper[:-1]
        if hull and hull[0] != hull[-1]:
            hull.append(hull[0])
        return hull

    @staticmethod
    def _chaikin_closed(ring: Sequence[Tuple[float, float]], iterations: int = 2) -> List[Tuple[float, float]]:
        if len(ring) < 4:
            return list(ring)
        points = list(ring[:-1]) if ring[0] == ring[-1] else list(ring)
        for _ in range(max(0, iterations)):
            refined: List[Tuple[float, float]] = []
            count = len(points)
            for idx in range(count):
                p0 = points[idx]
                p1 = points[(idx + 1) % count]
                q = (0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1])
                r = (0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1])
                refined.extend([q, r])
            points = refined
        if points[0] != points[-1]:
            points.append(points[0])
        return points

    @staticmethod
    def _ellipse_ring(center: Tuple[float, float], radius_x: float, radius_y: float, steps: int = 24) -> List[Tuple[float, float]]:
        cx, cy = center
        ring: List[Tuple[float, float]] = []
        for idx in range(steps):
            angle = 2.0 * math.pi * idx / steps
            ring.append((cx + radius_x * math.cos(angle), cy + radius_y * math.sin(angle)))
        ring.append(ring[0])
        return ring

    @staticmethod
    def _capsule_ring(
        a: Tuple[float, float],
        b: Tuple[float, float],
        width: float,
        segments: int = 10,
    ) -> List[Tuple[float, float]]:
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        if length == 0:
            return GeoDeploymentZoneService._ellipse_ring(a, width, width, steps=max(12, segments * 2))

        ux, uy = dx / length, dy / length
        px, py = -uy, ux
        r = width

        start_angle = math.atan2(py, px)
        end_angle = math.atan2(-py, -px)

        ring: List[Tuple[float, float]] = []
        for idx in range(segments + 1):
            t = idx / max(1, segments)
            ang = start_angle + t * math.pi
            ring.append((ax + math.cos(ang) * r, ay + math.sin(ang) * r))

        for idx in range(segments + 1):
            t = idx / max(1, segments)
            ang = end_angle + t * math.pi
            ring.append((bx + math.cos(ang) * r, by + math.sin(ang) * r))

        if ring[0] != ring[-1]:
            ring.append(ring[0])
        return ring

    @staticmethod
    def _polygon_area(points: Sequence[Tuple[float, float]]) -> float:
        if len(points) < 4:
            return 0.0
        area = 0.0
        for idx in range(len(points) - 1):
            x1, y1 = points[idx]
            x2, y2 = points[idx + 1]
            area += (x1 * y2) - (x2 * y1)
        return area / 2.0

    @staticmethod
    def _distance_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
        lon_a, lat_a = a
        lon_b, lat_b = b
        lat_mid = (lat_a + lat_b) / 2.0
        cos_lat = max(0.2, math.cos(math.radians(lat_mid)))
        dx = (lon_b - lon_a) * 111_320.0 * cos_lat
        dy = (lat_b - lat_a) * 110_540.0
        return math.hypot(dx, dy)

    @staticmethod
    def _quality_score(member_count: int, area_m2: float, state: str) -> float:
        if member_count <= 0:
            return 0.0
        base = min(1.0, 0.4 + (member_count / 20.0))
        if area_m2 <= 0:
            base *= 0.4
        if state in {"fallback", "degraded"}:
            base *= 0.75
        return round(max(0.0, min(1.0, base)), 3)

    @staticmethod
    def _lonlat_to_xy(lon: float, lat: float, lon0: float, lat0: float, cos_lat: float) -> Tuple[float, float]:
        x = (lon - lon0) * 111_320.0 * cos_lat
        y = (lat - lat0) * 110_540.0
        return x, y

    @staticmethod
    def _xy_to_lonlat(x: float, y: float, lon0: float, lat0: float, cos_lat: float) -> Tuple[float, float]:
        lon = lon0 + (x / (111_320.0 * cos_lat))
        lat = lat0 + (y / 110_540.0)
        return lon, lat

    def _xy_ring_to_lonlat(
        self,
        ring_xy: Sequence[Tuple[float, float]],
        centroid_lonlat: Tuple[float, float],
        cos_lat: Optional[float] = None,
    ) -> List[List[float]]:
        lon0, lat0 = centroid_lonlat
        ring_lonlat: List[List[float]] = []
        cos = cos_lat if cos_lat is not None else max(0.2, math.cos(math.radians(lat0)))
        for x, y in ring_xy:
            lon, lat = self._xy_to_lonlat(x, y, lon0, lat0, cos)
            ring_lonlat.append([lon, lat])
        if ring_lonlat and ring_lonlat[0] != ring_lonlat[-1]:
            ring_lonlat.append(ring_lonlat[0])
        return ring_lonlat

    @staticmethod
    def _ring_intersects_bbox(ring: Sequence[Sequence[float]], bbox: BBox) -> bool:
        if not ring:
            return False
        min_lon = min(point[0] for point in ring)
        max_lon = max(point[0] for point in ring)
        min_lat = min(point[1] for point in ring)
        max_lat = max(point[1] for point in ring)
        return not (
            max_lon < bbox.min_lon
            or min_lon > bbox.max_lon
            or max_lat < bbox.min_lat
            or min_lat > bbox.max_lat
        )

    @staticmethod
    def _iso_now() -> str:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# Alias de compatibilidad para no romper imports existentes.
GeoClusteringService = GeoDeploymentZoneService
