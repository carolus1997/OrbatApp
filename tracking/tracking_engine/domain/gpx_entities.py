from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class GpxIssue:
    code: str
    severity: str
    message: str


@dataclass
class GpxTrackPoint:
    lat: float
    lon: float
    ts: Optional[str] = None
    ele: Optional[float] = None
    external_track_id: Optional[str] = None


@dataclass
class GpxImportSummary:
    track_count: int = 0
    point_count: int = 0
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    bbox: Optional[Dict[str, float]] = None


@dataclass
class GpxImport:
    import_id: str
    source: str
    filename: Optional[str]
    raw_content: str
    status: str
    summary: GpxImportSummary = field(default_factory=GpxImportSummary)
    issues: List[GpxIssue] = field(default_factory=list)
    parsed_points: List[GpxTrackPoint] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
