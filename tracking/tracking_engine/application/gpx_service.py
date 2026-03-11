from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4
from xml.etree import ElementTree as ET

from tracking.tracking_engine.application.services import IngestPositionInput, TrackingService
from tracking.tracking_engine.domain.gpx_entities import GpxImport, GpxImportSummary, GpxIssue, GpxTrackPoint
from tracking.tracking_engine.ports.gpx_repository import GpxImportRepository


class GpxImportError(ValueError):
    pass


@dataclass
class CreateGpxImportInput:
    content: str
    filename: Optional[str] = None


@dataclass
class IngestGpxImportInput:
    import_id: str
    unit_id: str
    source: str = "network"
    accuracy: float = 25.0


class GpxImportService:
    def __init__(self, repository: GpxImportRepository, tracking_service: TrackingService) -> None:
        self._repository = repository
        self._tracking_service = tracking_service

    def create_import(self, data: CreateGpxImportInput) -> Dict[str, Any]:
        content = (data.content or "").strip()
        if not content:
            raise GpxImportError("content is required")

        gpx_import = GpxImport(
            import_id=str(uuid4()),
            source="gpx",
            filename=data.filename,
            raw_content=content,
            status="uploaded",
        )
        self._repository.save(gpx_import)
        return self._serialize(gpx_import)

    def get_import(self, import_id: str) -> Dict[str, Any]:
        gpx_import = self._repository.get(import_id)
        if not gpx_import:
            raise GpxImportError("import not found")
        return self._serialize(gpx_import)

    def validate_import(self, import_id: str) -> Dict[str, Any]:
        gpx_import = self._repository.get(import_id)
        if not gpx_import:
            raise GpxImportError("import not found")

        parsed = self._parse_gpx(gpx_import.raw_content)
        gpx_import.summary = parsed["summary"]
        gpx_import.issues = parsed["issues"]
        gpx_import.parsed_points = parsed["points"]
        gpx_import.metadata = parsed["metadata"]
        has_error = any(issue.severity == "error" for issue in gpx_import.issues)
        gpx_import.status = "rejected" if has_error else "ready_for_ingest"
        self._repository.save(gpx_import)
        return self._serialize(gpx_import)

    def ingest_import(self, data: IngestGpxImportInput) -> Dict[str, Any]:
        gpx_import = self._repository.get(data.import_id)
        if not gpx_import:
            raise GpxImportError("import not found")
        if gpx_import.status != "ready_for_ingest":
            raise GpxImportError("import is not ready for ingest")
        if not data.unit_id.strip():
            raise GpxImportError("unit_id is required")

        ingested = 0
        skipped = 0
        seen = set()
        for point in gpx_import.parsed_points:
            if not point.ts:
                skipped += 1
                continue
            key = (data.unit_id, point.external_track_id or "", point.ts)
            if key in seen:
                skipped += 1
                continue
            seen.add(key)
            self._tracking_service.ingest(
                IngestPositionInput(
                    entity_id=data.unit_id,
                    ts=_parse_iso_datetime(point.ts),
                    lat=point.lat,
                    lon=point.lon,
                    accuracy=data.accuracy,
                    source=data.source,
                    alt=point.ele,
                )
            )
            ingested += 1

        gpx_import.status = "validated"
        self._repository.save(gpx_import)
        return {
            **self._serialize(gpx_import),
            "ingest": {
                "unit_id": data.unit_id,
                "source": data.source,
                "ingested_points": ingested,
                "skipped_points": skipped,
            },
        }

    def _parse_gpx(self, raw_content: str) -> Dict[str, Any]:
        try:
            root = ET.fromstring(raw_content)
        except ET.ParseError as exc:
            return {
                "summary": GpxImportSummary(),
                "issues": [GpxIssue(code="invalid_xml", severity="error", message=str(exc))],
                "points": [],
                "metadata": {},
            }

        ns = ""
        if root.tag.startswith("{"):
            ns = root.tag.split("}", 1)[0] + "}"

        points: List[GpxTrackPoint] = []
        issues: List[GpxIssue] = []
        track_count = 0
        latitudes: List[float] = []
        longitudes: List[float] = []
        timestamps: List[str] = []
        track_names: List[str] = []

        for track_index, trk in enumerate(root.findall(f".//{ns}trk"), start=1):
            track_count += 1
            name = (trk.findtext(f"{ns}name") or f"track-{track_index}").strip()
            track_names.append(name)
            for point_index, trkpt in enumerate(trk.findall(f".//{ns}trkpt"), start=1):
                lat_raw = trkpt.attrib.get("lat")
                lon_raw = trkpt.attrib.get("lon")
                try:
                    lat = float(lat_raw) if lat_raw is not None else None
                    lon = float(lon_raw) if lon_raw is not None else None
                except ValueError:
                    issues.append(GpxIssue(code="invalid_coordinate", severity="error", message=f"{name} point {point_index} has invalid coordinates"))
                    continue
                if lat is None or lon is None:
                    issues.append(GpxIssue(code="missing_coordinate", severity="error", message=f"{name} point {point_index} missing lat/lon"))
                    continue

                time_text = (trkpt.findtext(f"{ns}time") or "").strip() or None
                ele_text = (trkpt.findtext(f"{ns}ele") or "").strip() or None
                ele = None
                if ele_text:
                    try:
                        ele = float(ele_text)
                    except ValueError:
                        issues.append(GpxIssue(code="invalid_elevation", severity="warn", message=f"{name} point {point_index} has invalid elevation"))

                if time_text:
                    try:
                        normalized_time = _parse_iso_datetime(time_text).isoformat()
                        timestamps.append(normalized_time)
                    except ValueError:
                        issues.append(GpxIssue(code="invalid_time", severity="error", message=f"{name} point {point_index} has invalid timestamp"))
                        normalized_time = None
                else:
                    issues.append(GpxIssue(code="missing_time", severity="warn", message=f"{name} point {point_index} without timestamp"))
                    normalized_time = None

                latitudes.append(lat)
                longitudes.append(lon)
                points.append(
                    GpxTrackPoint(
                        lat=lat,
                        lon=lon,
                        ts=normalized_time,
                        ele=ele,
                        external_track_id=name,
                    )
                )

        if not points:
            issues.append(GpxIssue(code="empty_gpx", severity="error", message="GPX contains no track points"))

        summary = GpxImportSummary(
            track_count=track_count,
            point_count=len(points),
            time_start=min(timestamps) if timestamps else None,
            time_end=max(timestamps) if timestamps else None,
            bbox=(
                {
                    "min_lon": min(longitudes),
                    "min_lat": min(latitudes),
                    "max_lon": max(longitudes),
                    "max_lat": max(latitudes),
                }
                if latitudes and longitudes
                else None
            ),
        )
        return {
            "summary": summary,
            "issues": issues,
            "points": points,
            "metadata": {"track_names": track_names},
        }

    def _serialize(self, gpx_import: GpxImport) -> Dict[str, Any]:
        return {
            "import_id": gpx_import.import_id,
            "source": gpx_import.source,
            "filename": gpx_import.filename,
            "status": gpx_import.status,
            "summary": {
                "track_count": gpx_import.summary.track_count,
                "point_count": gpx_import.summary.point_count,
                "time_start": gpx_import.summary.time_start,
                "time_end": gpx_import.summary.time_end,
                "bbox": gpx_import.summary.bbox,
            },
            "issues": [
                {"code": issue.code, "severity": issue.severity, "message": issue.message}
                for issue in gpx_import.issues
            ],
            "metadata": gpx_import.metadata,
        }


def _parse_iso_datetime(value: str) -> datetime:
    normalized = value.strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return parsed.astimezone(timezone.utc)
