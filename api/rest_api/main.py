import csv
import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from events.event_engine.adapters.in_memory_repository import InMemoryEventRepository
from events.event_engine.application.services import EventDomainError, EventService, TimelineQuery
from geo.geo_engine.application.clustering import BBox, GeoDeploymentZoneService
from geocoding.geocoding_engine.adapters.in_memory_repository import InMemoryUnitDraftRepository
from geocoding.geocoding_engine.adapters.nominatim_adapter import NominatimAdapter
from geocoding.geocoding_engine.application.services import (
    GeocodingDomainError,
    GeocodingService,
    TrackingIngestDraftInput,
    UnitDraftInput,
)
from orbat.orbat_engine.adapters.in_memory_repository import InMemoryUnitRepository
from orbat.orbat_engine.application.services import CreateUnitInput, OrbatDomainError, OrbatService, UpdateUnitInput
from tracking.tracking_engine.adapters.in_memory_repository import InMemoryTrackRepository, InMemoryTrackStateRepository
from tracking.tracking_engine.adapters.in_memory_gpx_repository import InMemoryGpxImportRepository
from tracking.tracking_engine.application.gpx_service import (
    CreateGpxImportInput,
    GpxImportError,
    GpxImportService,
    IngestGpxImportInput,
)
from tracking.tracking_engine.application.services import IngestPositionInput, TrackingDomainError, TrackingService

app = FastAPI(title="ORBAT Geospatial Platform", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core services
unit_repo = InMemoryUnitRepository()
orbat_service = OrbatService(unit_repo)
track_repo = InMemoryTrackRepository()
track_state_repo = InMemoryTrackStateRepository()
tracking_service = TrackingService(track_repo, track_state_repo)
gpx_import_repo = InMemoryGpxImportRepository()
gpx_import_service = GpxImportService(gpx_import_repo, tracking_service)
geo_zone_service = GeoDeploymentZoneService()

# Event engine
event_repo = InMemoryEventRepository()
event_service = EventService(event_repo)

# Geocoding engine
unit_draft_repo = InMemoryUnitDraftRepository()
geocoding_service = GeocodingService(provider=NominatimAdapter(), drafts=unit_draft_repo)


class UnitCreateRequest(BaseModel):
    id: str
    name: str
    type: str
    echelon: str
    status: str = "active"
    parent_id: Optional[str] = None


class UnitCreateV1Request(BaseModel):
    id: str
    name: str
    type: str
    echelon: str
    status: str = "active"
    parent_unit_id: Optional[str] = None
    draft_id: Optional[str] = None


class UnitPatchRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    echelon: Optional[str] = None
    status: Optional[str] = None
    parent_unit_id: Optional[str] = None


class OrbatCreateRequest(BaseModel):
    units: List[UnitCreateRequest]


class PositionCreateRequest(BaseModel):
    unit_id: str
    ts: datetime
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy: float = Field(ge=0)
    source: str
    alt: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None


class ReverseGeocodeRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    locale: str = "es"


class ForwardGeocodeRequest(BaseModel):
    query: str
    locale: str = "es"


class UnitDraftRequest(BaseModel):
    name: str
    parent_unit_id: Optional[str] = None
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    address_text: Optional[str] = None
    geocode_confidence: Optional[float] = Field(default=None, ge=0, le=1)


class TrackingIngestDraftRequest(BaseModel):
    unit_id: Optional[str] = None
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    address_text: Optional[str] = None
    geocode_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    provider_status: str = "ok"


class BulkUnitNodeRequest(BaseModel):
    id: str
    parent_id: Optional[str] = None
    name: str
    type: str
    order: int = Field(default=0, ge=0)
    status: str = "active"
    callsign: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)


class BulkPrevalidateRequest(BaseModel):
    nodes: List[BulkUnitNodeRequest]
    strict: bool = True
    single_root: bool = False


class BulkCommitRequest(BaseModel):
    nodes: List[BulkUnitNodeRequest]
    strict: bool = True
    single_root: bool = False


class TemplateValidateRequest(BaseModel):
    format: str = Field(description="json|csv")
    content: Optional[str] = None
    template: Optional[Dict[str, Any]] = None
    strict: bool = True
    single_root: bool = False


class TemplateImportRequest(BaseModel):
    format: str = Field(description="json|csv")
    content: Optional[str] = None
    template: Optional[Dict[str, Any]] = None
    strict: bool = True
    single_root: bool = False


class GpxImportCreateRequest(BaseModel):
    content: str
    filename: Optional[str] = None


class GpxImportIngestRequest(BaseModel):
    unit_id: str
    source: str = "network"
    accuracy: float = Field(default=25.0, ge=0)


def _serialize_unit(unit) -> Dict[str, Any]:
    return {
        "id": unit.id,
        "name": unit.name,
        "type": unit.type,
        "echelon": unit.echelon,
        "status": unit.status,
        "parent_id": unit.parent_id,
    }


def _error(row: Optional[int], node_id: Optional[str], code: str, message: str) -> Dict[str, Any]:
    return {"row": row, "id": node_id, "code": code, "message": message}


def _warning(row: Optional[int], node_id: Optional[str], code: str, message: str) -> Dict[str, Any]:
    return {"row": row, "id": node_id, "code": code, "message": message}


def _normalize_bulk_nodes(nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for idx, node in enumerate(nodes):
        normalized.append(
            {
                "row": idx + 1,
                "id": str(node.get("id", "")).strip(),
                "parent_id": (str(node.get("parent_id")).strip() or None) if node.get("parent_id") is not None else None,
                "name": str(node.get("name", "")).strip(),
                "type": str(node.get("type", "")).strip(),
                "order": int(node.get("order", 0) or 0),
                "status": str(node.get("status", "active") or "active").strip(),
                "callsign": node.get("callsign"),
                "geo": {"lat": node.get("lat"), "lon": node.get("lon")},
            }
        )
    return normalized


def _validate_bulk_nodes(
    nodes: List[Dict[str, Any]],
    strict: bool = True,
    single_root: bool = False,
) -> Dict[str, Any]:
    normalized = _normalize_bulk_nodes(nodes)
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    existing_units = orbat_service.list_units()
    existing_ids = {unit.id for unit in existing_units}
    existing_parent_by_id = {unit.id: unit.parent_id for unit in existing_units}

    payload_ids: Dict[str, int] = {}
    for node in normalized:
        node_id = node["id"]
        if not node_id:
            errors.append(_error(node["row"], None, "missing_id", "id is required"))
            continue
        if node_id in payload_ids:
            errors.append(_error(node["row"], node_id, "duplicate_id", "duplicated id in payload"))
            continue
        payload_ids[node_id] = node["row"]

    sibling_names: Dict[str, set] = {}
    for node in normalized:
        if not node["id"]:
            continue
        if node["id"] in existing_ids:
            errors.append(_error(node["row"], node["id"], "already_exists", "id already exists in ORBAT"))
        if node["parent_id"] and node["parent_id"] not in payload_ids and node["parent_id"] not in existing_ids:
            errors.append(_error(node["row"], node["id"], "missing_parent", f"parent '{node['parent_id']}' not found"))

        if not node["name"]:
            errors.append(_error(node["row"], node["id"], "missing_name", "name is required"))
        if not node["type"]:
            errors.append(_error(node["row"], node["id"], "missing_type", "type is required"))

        if node["geo"]["lat"] is None or node["geo"]["lon"] is None:
            warnings.append(_warning(node["row"], node["id"], "missing_geo", "geo coordinates missing"))

        sibling_key = node["parent_id"] or "__root__"
        sibling_names.setdefault(sibling_key, set())
        lowered = node["name"].lower()
        if lowered and lowered in sibling_names[sibling_key]:
            warnings.append(_warning(node["row"], node["id"], "duplicate_name_level", "name repeated in same hierarchy level"))
        if lowered:
            sibling_names[sibling_key].add(lowered)

    parent_by_id = dict(existing_parent_by_id)
    for node in normalized:
        if node["id"]:
            parent_by_id[node["id"]] = node["parent_id"]

    for node in normalized:
        node_id = node["id"]
        if not node_id:
            continue
        seen = {node_id}
        current = parent_by_id.get(node_id)
        while current:
            if current in seen:
                errors.append(_error(node["row"], node_id, "cycle", "hierarchy cycle detected"))
                break
            seen.add(current)
            current = parent_by_id.get(current)

    if single_root:
        roots = [node for node in normalized if node["id"] and not node["parent_id"]]
        if len(roots) > 1:
            errors.append(_error(None, None, "multiple_roots", "single_root mode allows only one root"))

    return {
        "strict": strict,
        "single_root": single_root,
        "nodes_count": len(normalized),
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "normalized_nodes": normalized,
    }


def _parse_template_nodes_from_json(template: Dict[str, Any]) -> Dict[str, Any]:
    nodes = template.get("nodes")
    if not isinstance(nodes, list):
        return {"nodes": [], "errors": [_error(None, None, "invalid_json", "template.nodes must be a list")]}
    return {"nodes": nodes, "errors": []}


def _parse_template_nodes_from_csv(content: str) -> Dict[str, Any]:
    required = {"id", "parent_id", "name", "type", "order", "status"}
    optional = {"callsign", "lat", "lon"}
    issues: List[Dict[str, Any]] = []
    parsed: List[Dict[str, Any]] = []
    if not content.strip():
        return {"nodes": [], "errors": [_error(None, None, "empty_csv", "csv content is empty")]}

    reader = csv.DictReader(io.StringIO(content))
    headers = set(reader.fieldnames or [])
    missing_headers = sorted(required - headers)
    if missing_headers:
        return {
            "nodes": [],
            "errors": [_error(None, None, "missing_columns", f"missing required columns: {', '.join(missing_headers)}")],
        }

    allowed = required | optional
    unknown_headers = sorted(headers - allowed)
    if unknown_headers:
        issues.append(_warning(None, None, "unknown_columns", f"unknown columns ignored: {', '.join(unknown_headers)}"))

    for idx, row in enumerate(reader, start=2):
        try:
            order = int((row.get("order") or "0").strip() or 0)
            if order < 0:
                raise ValueError("order must be >= 0")
        except ValueError as exc:
            issues.append(_error(idx, row.get("id"), "invalid_order", str(exc)))
            continue

        lat_val = (row.get("lat") or "").strip()
        lon_val = (row.get("lon") or "").strip()
        lat = None
        lon = None
        if lat_val or lon_val:
            try:
                lat = float(lat_val) if lat_val else None
                lon = float(lon_val) if lon_val else None
            except ValueError:
                issues.append(_error(idx, row.get("id"), "invalid_geo", "lat/lon must be numeric"))
                continue

        parsed.append(
            {
                "id": (row.get("id") or "").strip(),
                "parent_id": (row.get("parent_id") or "").strip() or None,
                "name": (row.get("name") or "").strip(),
                "type": (row.get("type") or "").strip(),
                "order": order,
                "status": (row.get("status") or "active").strip() or "active",
                "callsign": (row.get("callsign") or "").strip() or None,
                "lat": lat,
                "lon": lon,
            }
        )
    return {"nodes": parsed, "errors": issues}


def _parse_template_nodes(format_name: str, content: Optional[str], template: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    fmt = format_name.lower().strip()
    if fmt == "json":
        if not template:
            return {"nodes": [], "errors": [_error(None, None, "missing_template", "template payload is required for json format")]}
        return _parse_template_nodes_from_json(template)
    if fmt == "csv":
        if content is None:
            return {"nodes": [], "errors": [_error(None, None, "missing_content", "content payload is required for csv format")]}
        return _parse_template_nodes_from_csv(content)
    return {"nodes": [], "errors": [_error(None, None, "unsupported_format", "format must be json or csv")]}


def _bulk_commit(normalized_nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
    pending = {node["id"]: node for node in normalized_nodes if node["id"]}
    created_order: List[str] = []
    row_results: List[Dict[str, Any]] = []
    existing_ids = {unit.id for unit in orbat_service.list_units()}

    while pending:
        progressed = False
        for unit_id, node in list(pending.items()):
            parent_id = node["parent_id"]
            if parent_id and parent_id not in existing_ids and parent_id not in created_order:
                continue

            try:
                orbat_service.create_unit(
                    CreateUnitInput(
                        id=node["id"],
                        name=node["name"],
                        type=node["type"],
                        echelon=node["type"],
                        status=node["status"],
                        parent_id=node["parent_id"],
                    )
                )
                lat = node.get("geo", {}).get("lat")
                lon = node.get("geo", {}).get("lon")
                if lat is not None and lon is not None:
                    tracking_service.ingest(
                        IngestPositionInput(
                            entity_id=node["id"],
                            ts=datetime.now(timezone.utc),
                            lat=float(lat),
                            lon=float(lon),
                            accuracy=25.0,
                            source="manual",
                        )
                    )
                created_order.append(unit_id)
                row_results.append(
                    {
                        "row": node["row"],
                        "id": unit_id,
                        "status": "created",
                        "tracking_seeded": lat is not None and lon is not None,
                    }
                )
                del pending[unit_id]
                progressed = True
            except (OrbatDomainError, TrackingDomainError) as exc:
                row_results.append({"row": node["row"], "id": unit_id, "status": "error", "detail": str(exc)})
                for created_id in reversed(created_order):
                    try:
                        orbat_service.delete_unit(created_id)
                    except OrbatDomainError:
                        pass
                return {
                    "accepted": False,
                    "created": 0,
                    "errors": [{"id": unit_id, "detail": str(exc)}],
                    "row_results": row_results,
                }
        if not progressed:
            for created_id in reversed(created_order):
                try:
                    orbat_service.delete_unit(created_id)
                except OrbatDomainError:
                    pass
            unresolved = list(pending.keys())
            return {
                "accepted": False,
                "created": 0,
                "errors": [{"code": "unresolved_dependencies", "detail": f"pending nodes: {', '.join(unresolved)}"}],
                "row_results": row_results,
            }

    return {
        "accepted": True,
        "created": len(created_order),
        "errors": [],
        "row_results": row_results,
    }


def _build_orbat_tree(root_id: Optional[str] = None, depth: Optional[int] = None, q: Optional[str] = None) -> Dict[str, Any]:
    units = orbat_service.list_units()
    by_parent: Dict[Optional[str], List[Any]] = {}
    by_id: Dict[str, Any] = {}
    for unit in units:
        by_id[unit.id] = unit
        by_parent.setdefault(unit.parent_id, []).append(unit)
    for siblings in by_parent.values():
        siblings.sort(key=lambda item: (item.name.lower(), item.id))

    q_lower = q.lower().strip() if q else None

    def walk(node, current_depth: int, path: str) -> Optional[Dict[str, Any]]:
        if depth is not None and current_depth > depth:
            return None
        node_path = f"{path}/{node.id}" if path else node.id
        children_raw = by_parent.get(node.id, [])
        children = []
        for child in children_raw:
            child_node = walk(child, current_depth + 1, node_path)
            if child_node:
                children.append(child_node)

        searchable = f"{node.id} {node.name} {node_path}".lower()
        matches = q_lower is None or q_lower in searchable or bool(children)
        if not matches:
            return None

        return {
            "id": node.id,
            "name": node.name,
            "type": node.type,
            "status": node.status,
            "parent_id": node.parent_id,
            "depth": current_depth,
            "path": node_path,
            "children": children,
        }

    if root_id:
        root = by_id.get(root_id)
        if not root:
            raise HTTPException(status_code=404, detail="root_id not found")
        roots = [walk(root, 0, "")]
    else:
        roots = [walk(root, 0, "") for root in by_parent.get(None, [])]

    valid_roots = [node for node in roots if node]
    return {"root_count": len(valid_roots), "nodes": valid_roots}


def _flatten_tree_nodes(tree_nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    flat: List[Dict[str, Any]] = []
    stack = list(reversed(tree_nodes))
    while stack:
        item = stack.pop()
        children = item.pop("children", [])
        flat.append(item)
        for child in reversed(children):
            stack.append(child)
    return flat



@app.get("/units")
def list_units() -> List[dict]:
    return [_serialize_unit(unit) for unit in orbat_service.list_units()]


@app.post("/unit")
def create_unit(request: UnitCreateRequest) -> dict:
    try:
        unit = orbat_service.create_unit(
            CreateUnitInput(
                id=request.id,
                name=request.name,
                type=request.type,
                echelon=request.echelon,
                status=request.status,
                parent_id=request.parent_id,
            )
        )
        return _serialize_unit(unit)
    except OrbatDomainError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/unit/{unit_id}")
def get_unit(unit_id: str) -> dict:
    unit = orbat_service.get_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return _serialize_unit(unit)


@app.post("/orbat")
def create_orbat(request: OrbatCreateRequest) -> dict:
    try:
        payload = [
            CreateUnitInput(
                id=item.id,
                name=item.name,
                type=item.type,
                echelon=item.echelon,
                status=item.status,
                parent_id=item.parent_id,
            )
            for item in request.units
        ]
        return orbat_service.create_orbat(payload)
    except OrbatDomainError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/orbat/{unit_id}")
def get_orbat(unit_id: str) -> dict:
    try:
        return orbat_service.get_subtree(unit_id)
    except OrbatDomainError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/position")
def ingest_position(request: PositionCreateRequest) -> dict:
    try:
        result = tracking_service.ingest(
            IngestPositionInput(
                entity_id=request.unit_id,
                ts=request.ts,
                lat=request.lat,
                lon=request.lon,
                accuracy=request.accuracy,
                source=request.source,
                alt=request.alt,
                speed=request.speed,
                heading=request.heading,
            )
        )
        point = result["point"]
        state = result["state"]
        return {
            "unit_id": point.entity_id,
            "point_id": point.id,
            "ingest_to_publish_ms": result["ingest_to_publish_ms"],
            "freshness": state.freshness,
        }
    except TrackingDomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/positions/{unit_id}")
def get_positions(unit_id: str, limit: int = 100) -> dict:
    data = tracking_service.get_positions(unit_id, limit=limit)
    if not data["latest"]:
        return {
            "status": "no_track",
            "latest": None,
            "state": {
                "freshness": "lost",
                "updated_at": None,
                "lag_ms": None,
            },
            "trail": [],
        }

    latest = data["latest"]
    state = data["state"]
    trail = data["trail"]

    return {
        "status": "ok",
        "latest": {
            "id": latest.id,
            "unit_id": latest.entity_id,
            "ts": latest.ts.isoformat(),
            "lat": latest.lat,
            "lon": latest.lon,
            "accuracy": latest.accuracy,
            "source": latest.source,
        },
        "state": {
            "freshness": state.freshness if state else None,
            "updated_at": state.updated_at.isoformat() if state else None,
            "lag_ms": state.lag_ms if state else None,
        },
        "trail": [
            {
                "id": point.id,
                "ts": point.ts.isoformat(),
                "lat": point.lat,
                "lon": point.lon,
                "source": point.source,
            }
            for point in trail
        ],
    }


def _parse_bbox(bbox: Optional[str]) -> Optional[BBox]:
    if not bbox:
        return None
    try:
        values = [float(part.strip()) for part in bbox.split(",")]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="bbox must contain numeric values") from exc

    if len(values) != 4:
        raise HTTPException(status_code=400, detail="bbox must be minLon,minLat,maxLon,maxLat")

    min_lon, min_lat, max_lon, max_lat = values
    if min_lon >= max_lon or min_lat >= max_lat:
        raise HTTPException(status_code=400, detail="bbox coordinates are invalid")
    return BBox(min_lon=min_lon, min_lat=min_lat, max_lon=max_lon, max_lat=max_lat)


@app.get("/api/v1/geo/features")
def get_geo_features(zoom: int, bbox: Optional[str] = None, layer: str = "orbat") -> dict:
    if layer != "orbat":
        raise HTTPException(status_code=400, detail="only 'orbat' layer is supported in vertical slice")
    if zoom < 0 or zoom > 22:
        raise HTTPException(status_code=400, detail="zoom must be between 0 and 22")

    parsed_bbox = _parse_bbox(bbox)
    units = orbat_service.list_units()

    latest_positions = {}
    freshness_by_unit = {}
    for unit in units:
        positions = tracking_service.get_positions(unit.id, limit=1)
        latest = positions["latest"]
        state = positions["state"]
        if latest:
            latest_positions[unit.id] = latest
            if state:
                freshness_by_unit[unit.id] = state.freshness

    response = geo_zone_service.build_features(
        units=units,
        latest_positions=latest_positions,
        freshness_by_unit=freshness_by_unit,
        zoom=zoom,
        bbox=parsed_bbox,
    )
    response["version"] = "1.0"
    response["server_time"] = datetime.utcnow().isoformat() + "Z"
    return response


# Event API v1
@app.post("/api/v1/events/ingest/{source}")
def ingest_event(source: str, payload: Dict[str, Any]) -> dict:
    try:
        return event_service.ingest(payload=payload, source=source)
    except EventDomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/events/timeline")
def events_timeline(
    unit: Optional[str] = None,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
    sources: Optional[str] = None,
    limit: int = 100,
    cursor: int = 0,
) -> dict:
    source_list = [item.strip() for item in sources.split(",") if item.strip()] if sources else []
    return event_service.timeline(
        TimelineQuery(
            unit=unit,
            from_ts=from_ts,
            to_ts=to_ts,
            sources=source_list,
            limit=limit,
            cursor=cursor,
        )
    )


# Geocoding API v1
@app.post("/api/v1/geocoding/reverse")
def reverse_geocoding(request: ReverseGeocodeRequest) -> dict:
    try:
        return geocoding_service.reverse(lat=request.lat, lon=request.lon, locale=request.locale)
    except GeocodingDomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/geocoding/search")
def search_geocoding(request: ForwardGeocodeRequest) -> dict:
    try:
        return geocoding_service.forward(query=request.query, locale=request.locale)
    except GeocodingDomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/units/draft")
def create_unit_draft(request: UnitDraftRequest) -> dict:
    try:
        return geocoding_service.create_draft(
            UnitDraftInput(
                name=request.name,
                parent_unit_id=request.parent_unit_id,
                lat=request.lat,
                lon=request.lon,
                address_text=request.address_text,
                geocode_confidence=request.geocode_confidence,
            )
        )
    except GeocodingDomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/tracking/ingest/draft")
def create_tracking_ingest_draft(request: TrackingIngestDraftRequest) -> dict:
    try:
        return geocoding_service.create_tracking_ingest_draft(
            TrackingIngestDraftInput(
                unit_id=request.unit_id,
                lat=request.lat,
                lon=request.lon,
                address_text=request.address_text,
                geocode_confidence=request.geocode_confidence,
                provider_status=request.provider_status,
            )
        )
    except GeocodingDomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/units")
def create_unit_v1(request: UnitCreateV1Request) -> dict:
    if request.draft_id:
        draft = geocoding_service.get_draft(request.draft_id)
        if not draft:
            raise HTTPException(status_code=404, detail="draft not found")
    try:
        unit = orbat_service.create_unit(
            CreateUnitInput(
                id=request.id,
                name=request.name,
                type=request.type,
                echelon=request.echelon,
                status=request.status,
                parent_id=request.parent_unit_id,
            )
        )
        return _serialize_unit(unit)
    except OrbatDomainError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.patch("/api/v1/units/{unit_id}")
def patch_unit_v1(unit_id: str, request: UnitPatchRequest) -> dict:
    try:
        updated = orbat_service.update_unit(
            UpdateUnitInput(
                unit_id=unit_id,
                name=request.name,
                type=request.type,
                echelon=request.echelon,
                status=request.status,
                parent_id=request.parent_unit_id,
            )
        )
        return _serialize_unit(updated)
    except OrbatDomainError as exc:
        if "not found" in str(exc):
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/api/v1/units/{unit_id}")
def delete_unit_v1(unit_id: str) -> dict:
    try:
        orbat_service.delete_unit(unit_id)
        return {"deleted": True, "unit_id": unit_id}
    except OrbatDomainError as exc:
        if "not found" in str(exc):
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/v1/geo/events")
def get_geo_events(
    bbox: Optional[str] = None,
    zoom: int = 12,
    types: Optional[str] = None,
    sources: Optional[str] = None,
    severity: Optional[str] = None,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
    limit: int = 300,
) -> dict:
    if zoom < 0 or zoom > 22:
        raise HTTPException(status_code=400, detail="zoom must be between 0 and 22")
    parsed_bbox = _parse_bbox(bbox)
    source_list = [item.strip() for item in sources.split(",") if item.strip()] if sources else []
    type_set = {item.strip() for item in types.split(",") if item.strip()} if types else set()
    severity_set = {item.strip().lower() for item in severity.split(",") if item.strip()} if severity else set()

    timeline = event_service.timeline(
        TimelineQuery(
            unit=None,
            from_ts=from_ts,
            to_ts=to_ts,
            sources=source_list,
            limit=min(limit, 1000),
            cursor=0,
        )
    )

    features: List[Dict[str, Any]] = []
    for item in timeline["items"]:
        geo = item.get("geo")
        if not geo:
            continue
        event_type = item.get("event_type", "")
        if type_set and event_type not in type_set:
            continue
        sev = str((item.get("severity") or "")).lower()
        if severity_set and sev not in severity_set:
            continue
        lat = geo.get("lat")
        lon = geo.get("lon")
        if lat is None or lon is None:
            continue
        if parsed_bbox and not parsed_bbox.contains(lat=lat, lon=lon):
            continue

        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "layer": "events-point",
                    "event_id": item.get("event_id"),
                    "event_type": event_type,
                    "source_system": item.get("source_system"),
                    "severity": item.get("severity") or "unknown",
                    "ts": item.get("ts"),
                    "summary": item.get("summary"),
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "server_time": datetime.utcnow().isoformat() + "Z",
        "count": len(features),
    }


@app.post("/api/v1/orbat/bulk/prevalidate")
def orbat_bulk_prevalidate(request: BulkPrevalidateRequest) -> dict:
    nodes = [node.model_dump() for node in request.nodes]
    return _validate_bulk_nodes(nodes, strict=request.strict, single_root=request.single_root)


@app.post("/api/v1/orbat/bulk/commit")
def orbat_bulk_commit(request: BulkCommitRequest) -> dict:
    nodes = [node.model_dump() for node in request.nodes]
    validation = _validate_bulk_nodes(nodes, strict=request.strict, single_root=request.single_root)
    if not validation["valid"]:
        raise HTTPException(status_code=409, detail={"message": "bulk validation failed", "errors": validation["errors"]})
    commit_result = _bulk_commit(validation["normalized_nodes"])
    if not commit_result["accepted"]:
        raise HTTPException(status_code=409, detail={"message": "bulk commit failed", "errors": commit_result["errors"]})
    return {"validation": validation, "commit": commit_result}


@app.post("/api/v1/orbat/templates/validate")
def validate_orbat_template(request: TemplateValidateRequest) -> dict:
    parsed = _parse_template_nodes(request.format, request.content, request.template)
    parser_errors = parsed["errors"]
    nodes = parsed["nodes"]
    validation = _validate_bulk_nodes(nodes, strict=request.strict, single_root=request.single_root)
    if parser_errors:
        validation["errors"] = parser_errors + validation["errors"]
        validation["valid"] = False
    return {
        "format": request.format,
        "valid": validation["valid"],
        "errors": validation["errors"],
        "warnings": validation["warnings"],
        "normalized_nodes": validation["normalized_nodes"],
    }


@app.post("/api/v1/orbat/templates/import")
def import_orbat_template(request: TemplateImportRequest) -> dict:
    parsed = _parse_template_nodes(request.format, request.content, request.template)
    parser_errors = parsed["errors"]
    nodes = parsed["nodes"]
    validation = _validate_bulk_nodes(nodes, strict=request.strict, single_root=request.single_root)
    if parser_errors:
        validation["errors"] = parser_errors + validation["errors"]
        validation["valid"] = False
    if not validation["valid"]:
        raise HTTPException(status_code=409, detail={"message": "template validation failed", "errors": validation["errors"]})
    commit_result = _bulk_commit(validation["normalized_nodes"])
    if not commit_result["accepted"]:
        raise HTTPException(status_code=409, detail={"message": "template import failed", "errors": commit_result["errors"]})
    return {"format": request.format, "validation": validation, "commit": commit_result}


@app.get("/api/v1/orbat/templates/presets")
def orbat_template_presets() -> dict:
    return {
        "items": [
            {
                "id": "preset-patrol-alpha",
                "name": "Patrol Alpha",
                "description": "Comandancia con dos secciones y operadores base",
                "template": {
                    "template_version": "1.0",
                    "meta": {"name": "Patrol Alpha", "description": "Preset", "created_by": "system"},
                    "nodes": [
                        {"id": "CMD-ALPHA", "parent_id": None, "name": "Alpha Command", "type": "command", "order": 0, "status": "active"},
                        {"id": "SEC-ALPHA-1", "parent_id": "CMD-ALPHA", "name": "Section 1", "type": "section", "order": 0, "status": "active"},
                        {"id": "SEC-ALPHA-2", "parent_id": "CMD-ALPHA", "name": "Section 2", "type": "section", "order": 1, "status": "active"},
                        {"id": "OP-ALPHA-1", "parent_id": "SEC-ALPHA-1", "name": "Operator 1", "type": "operator", "order": 0, "status": "active"},
                    ],
                },
            },
            {
                "id": "preset-event-shield",
                "name": "Event Shield",
                "description": "Estructura ligera para cobertura de evento",
                "template": {
                    "template_version": "1.0",
                    "meta": {"name": "Event Shield", "description": "Preset", "created_by": "system"},
                    "nodes": [
                        {"id": "CMD-SHIELD", "parent_id": None, "name": "Shield Command", "type": "command", "order": 0, "status": "active"},
                        {"id": "TEAM-SHIELD-1", "parent_id": "CMD-SHIELD", "name": "Shield Team 1", "type": "team", "order": 0, "status": "active"},
                        {"id": "TEAM-SHIELD-2", "parent_id": "CMD-SHIELD", "name": "Shield Team 2", "type": "team", "order": 1, "status": "active"},
                    ],
                },
            },
        ]
    }


@app.get("/api/v1/orbat/tree")
def get_orbat_tree(root_id: Optional[str] = None, depth: Optional[int] = None, q: Optional[str] = None) -> dict:
    if depth is not None and depth < 0:
        raise HTTPException(status_code=400, detail="depth must be >= 0")
    return _build_orbat_tree(root_id=root_id, depth=depth, q=q)


@app.get("/api/v1/orbat/tree/index")
def get_orbat_tree_index(root_id: Optional[str] = None) -> dict:
    tree = _build_orbat_tree(root_id=root_id, depth=None, q=None)
    return {"root_count": tree["root_count"], "items": _flatten_tree_nodes(tree["nodes"])}


@app.get("/api/v1/orbat/{unit_id}/export.json")
def export_orbat_json(unit_id: str) -> dict:
    tree = _build_orbat_tree(root_id=unit_id, depth=None, q=None)
    if not tree["nodes"]:
        raise HTTPException(status_code=404, detail="unit not found")

    root = tree["nodes"][0]
    flat = _flatten_tree_nodes([root])
    nodes: List[Dict[str, Any]] = []
    for item in flat:
        nodes.append(
            {
                "id": item["id"],
                "parent_id": item["parent_id"],
                "name": item["name"],
                "type": item["type"],
                "order": 0,
                "callsign": None,
                "status": item["status"],
                "geo": {"lat": None, "lon": None},
            }
        )
    return {
        "template_version": "1.0",
        "meta": {
            "name": f"Export {unit_id}",
            "description": "ORBAT subtree export",
            "created_by": "system",
        },
        "nodes": nodes,
    }


@app.post("/api/v1/c3is/gpx/import")
def create_gpx_import(request: GpxImportCreateRequest) -> dict:
    try:
        return gpx_import_service.create_import(CreateGpxImportInput(content=request.content, filename=request.filename))
    except GpxImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/v1/c3is/gpx/import/{import_id}")
def get_gpx_import(import_id: str) -> dict:
    try:
        return gpx_import_service.get_import(import_id)
    except GpxImportError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/v1/c3is/gpx/import/{import_id}/validate")
def validate_gpx_import(import_id: str) -> dict:
    try:
        return gpx_import_service.validate_import(import_id)
    except GpxImportError as exc:
        status_code = 404 if "not found" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@app.post("/api/v1/c3is/gpx/import/{import_id}/ingest")
def ingest_gpx_import(import_id: str, request: GpxImportIngestRequest) -> dict:
    try:
        return gpx_import_service.ingest_import(
            IngestGpxImportInput(
                import_id=import_id,
                unit_id=request.unit_id,
                source=request.source,
                accuracy=request.accuracy,
            )
        )
    except GpxImportError as exc:
        status_code = 404 if "not found" in str(exc) else 409
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except TrackingDomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# Load demo events at startup for timeline testing
_DEMO_EVENTS_ROOT = Path(__file__).parent.parent.parent / "coordination" / "demo_data"
if _DEMO_EVENTS_ROOT.exists():
    event_service.ingest_demo_events(_DEMO_EVENTS_ROOT)


_FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend"
if _FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")
