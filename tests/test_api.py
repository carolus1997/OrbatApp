from datetime import datetime, timezone

from fastapi.testclient import TestClient
from uuid import uuid4

from api.rest_api.main import app


client = TestClient(app)


def test_create_and_get_unit() -> None:
    unit_id = f"u-root-{uuid4().hex[:6]}"
    response = client.post(
        "/unit",
        json={
            "id": unit_id,
            "name": "Root",
            "type": "company",
            "echelon": "company",
            "status": "active",
        },
    )
    assert response.status_code == 200

    lookup = client.get(f"/unit/{unit_id}")
    assert lookup.status_code == 200
    assert lookup.json()["id"] == unit_id


def test_orbat_tree() -> None:
    root_id = f"u-a-{uuid4().hex[:6]}"
    child_id = f"{root_id}-1"
    response = client.post(
        "/orbat",
        json={
            "units": [
                {
                    "id": root_id,
                    "name": "Alpha",
                    "type": "company",
                    "echelon": "company",
                    "status": "active",
                },
                {
                    "id": child_id,
                    "name": "Alpha-1",
                    "type": "platoon",
                    "echelon": "platoon",
                    "status": "active",
                    "parent_id": root_id,
                },
            ]
        },
    )

    assert response.status_code == 200
    tree = client.get(f"/orbat/{root_id}")
    assert tree.status_code == 200
    assert len(tree.json()["children"]) >= 1


def test_ingest_and_get_positions() -> None:
    unit_id = f"u-p-{uuid4().hex[:6]}"
    unit = client.post(
        "/unit",
        json={
            "id": unit_id,
            "name": "P",
            "type": "team",
            "echelon": "team",
            "status": "active",
        },
    )
    assert unit.status_code == 200

    ingest = client.post(
        "/position",
        json={
            "unit_id": unit_id,
            "ts": "2026-03-05T19:00:00+00:00",
            "lat": 40.4168,
            "lon": -3.7038,
            "accuracy": 5,
            "source": "bodycam",
        },
    )
    assert ingest.status_code == 200

    positions = client.get(f"/positions/{unit_id}")
    assert positions.status_code == 200
    body = positions.json()
    assert body["latest"]["unit_id"] == unit_id
    assert body["state"]["freshness"] in {"fresh", "stale", "lost"}
    assert body["status"] == "ok"


def test_get_positions_without_track_returns_no_track() -> None:
    unit_id = f"u-empty-{uuid4().hex[:6]}"
    unit = client.post(
        "/unit",
        json={
            "id": unit_id,
            "name": "NoTrack",
            "type": "team",
            "echelon": "team",
            "status": "active",
        },
    )
    assert unit.status_code == 200

    positions = client.get(f"/positions/{unit_id}")
    assert positions.status_code == 200
    payload = positions.json()
    assert payload["status"] == "no_track"
    assert payload["latest"] is None
    assert payload["trail"] == []


def test_geo_features_without_clusterization() -> None:
    root_id = f"u-geo-root-cmd-{uuid4().hex[:6]}"
    child_a = f"{root_id}-a"
    child_b = f"{root_id}-b"

    response = client.post(
        "/orbat",
        json={
            "units": [
                {
                    "id": root_id,
                    "name": "GeoRootCommand",
                    "type": "command",
                    "echelon": "command",
                    "status": "active",
                },
                {
                    "id": child_a,
                    "name": "GeoA",
                    "type": "team",
                    "echelon": "team",
                    "status": "active",
                    "parent_id": root_id,
                },
                {
                    "id": child_b,
                    "name": "GeoB",
                    "type": "team",
                    "echelon": "team",
                    "status": "active",
                    "parent_id": root_id,
                },
            ]
        },
    )
    assert response.status_code == 200

    now_iso = datetime.now(timezone.utc).isoformat()
    for unit_id, lat, lon in [
        (root_id, 40.4165, -3.7042),
        (child_a, 40.4168, -3.7038),
        (child_b, 40.4172, -3.7032),
    ]:
        ingest = client.post(
            "/position",
            json={
                "unit_id": unit_id,
                "ts": now_iso,
                "lat": lat,
                "lon": lon,
                "accuracy": 5,
                "source": "bodycam",
            },
        )
        assert ingest.status_code == 200

    zoom13 = client.get("/api/v1/geo/features?zoom=13&layer=orbat")
    assert zoom13.status_code == 200
    features13 = zoom13.json()["features"]
    assert any(f["properties"]["layer"] == "orbat-link" for f in features13)
    assert any(f["properties"]["layer"] == "units-point" for f in features13)

    zoom11 = client.get("/api/v1/geo/features?zoom=11&layer=orbat")
    assert zoom11.status_code == 200
    features11 = zoom11.json()["features"]
    assert not any(f["properties"]["layer"] == "command-cluster" for f in features11)
    assert not any(f["properties"]["layer"] == "deployment-zone" for f in features11)
    assert any(f["properties"]["layer"] == "orbat-link" for f in features11)


def test_events_ingest_and_timeline_v1() -> None:
    payload = {
        "event_id": f"evt-{uuid4()}",
        "schema_version": "1.0.0",
        "event_type": "CALL_EVENT",
        "occurred_at": "2026-03-06T10:00:00Z",
        "ingested_at": "2026-03-06T10:00:00Z",
        "source_system": "telephony",
        "source_ref": f"src-{uuid4().hex[:8]}",
        "correlation_id": "corr-1",
        "trace_id": "trace-1",
        "classification": "internal",
        "operation_id": "op-test",
        "unit_refs": ["unit-timeline-1"],
        "entity_refs": [{"entity_type": "operator", "entity_id": "op-1"}],
        "payload": {"kind": "call", "attributes": {"direction": "incoming", "duration_s": 10}},
    }
    ingest = client.post("/api/v1/events/ingest/telephony", json=payload)
    assert ingest.status_code == 200
    assert ingest.json()["accepted"] is True

    timeline = client.get("/api/v1/events/timeline?unit=unit-timeline-1&limit=5")
    assert timeline.status_code == 200
    assert timeline.json()["count"] >= 1


def test_geocoding_reverse_and_unit_draft_flow() -> None:
    reverse = client.post(
        "/api/v1/geocoding/reverse",
        json={"lat": 40.4168, "lon": -3.7038, "locale": "es"},
    )
    assert reverse.status_code == 200
    rev = reverse.json()
    assert rev["provider"] == "nominatim"

    draft = client.post(
        "/api/v1/units/draft",
        json={
            "name": "Draft Unit",
            "parent_unit_id": None,
            "lat": 40.4168,
            "lon": -3.7038,
            "address_text": rev.get("address_text"),
            "geocode_confidence": rev.get("confidence", 0),
        },
    )
    assert draft.status_code == 200
    draft_id = draft.json()["id"]

    unit_id = f"u-v1-{uuid4().hex[:6]}"
    create = client.post(
        "/api/v1/units",
        json={
            "id": unit_id,
            "name": "Unit V1",
            "type": "security",
            "echelon": "operator",
            "status": "active",
            "parent_unit_id": None,
            "draft_id": draft_id,
        },
    )
    assert create.status_code == 200
    assert create.json()["id"] == unit_id


def test_geocoding_search_returns_payload() -> None:
    search = client.post(
        "/api/v1/geocoding/search",
        json={"query": "Puerta del Sol, Madrid", "locale": "es"},
    )
    assert search.status_code == 200
    body = search.json()
    assert body["provider"] == "nominatim"
    assert "query" in body


def test_create_unit_v1_with_missing_draft_returns_404() -> None:
    unit_id = f"u-v1-missing-draft-{uuid4().hex[:6]}"
    create = client.post(
        "/api/v1/units",
        json={
            "id": unit_id,
            "name": "Unit Missing Draft",
            "type": "security",
            "echelon": "operator",
            "status": "active",
            "parent_unit_id": None,
            "draft_id": "draft-not-found",
        },
    )
    assert create.status_code == 404


def test_create_tracking_ingest_draft_v1() -> None:
    draft = client.post(
        "/api/v1/tracking/ingest/draft",
        json={
            "unit_id": "unit-track-1",
            "lat": 40.4168,
            "lon": -3.7038,
            "address_text": "Madrid",
            "geocode_confidence": 0.9,
            "provider_status": "ok",
        },
    )
    assert draft.status_code == 200
    body = draft.json()
    assert body["flow_type"] == "tracking_ingest"
    assert body["unit_id"] == "unit-track-1"


def test_patch_and_delete_unit_v1() -> None:
    unit_id = f"u-edit-{uuid4().hex[:6]}"
    created = client.post(
        "/api/v1/units",
        json={
            "id": unit_id,
            "name": "Editable",
            "type": "security",
            "echelon": "team",
            "status": "active",
            "parent_unit_id": None,
        },
    )
    assert created.status_code == 200

    patched = client.patch(
        f"/api/v1/units/{unit_id}",
        json={"name": "Edited", "status": "degraded"},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Edited"
    assert patched.json()["status"] == "degraded"

    deleted = client.delete(f"/api/v1/units/{unit_id}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True


def test_delete_unit_with_children_returns_409() -> None:
    root = f"u-delroot-{uuid4().hex[:5]}"
    child = f"{root}-c"
    created = client.post(
        "/orbat",
        json={
            "units": [
                {"id": root, "name": "Root", "type": "company", "echelon": "company", "status": "active"},
                {"id": child, "name": "Child", "type": "team", "echelon": "team", "status": "active", "parent_id": root},
            ]
        },
    )
    assert created.status_code == 200
    deleted = client.delete(f"/api/v1/units/{root}")
    assert deleted.status_code == 409


def test_geo_events_endpoint_returns_features() -> None:
    payload = {
        "event_id": f"evt-geo-{uuid4()}",
        "schema_version": "1.0.0",
        "event_type": "ALERT_RAISED",
        "occurred_at": "2026-03-06T11:00:00Z",
        "ingested_at": "2026-03-06T11:00:00Z",
        "source_system": "manual",
        "source_ref": f"src-geo-{uuid4().hex[:6]}",
        "correlation_id": "corr-geo",
        "trace_id": "trace-geo",
        "classification": "internal",
        "operation_id": "op-geo",
        "unit_refs": ["unit-geo"],
        "entity_refs": [{"entity_type": "unit", "entity_id": "unit-geo"}],
        "geo": {"lat": 40.4168, "lon": -3.7038, "srid": 4326},
        "payload": {"kind": "alert", "attributes": {"severity": "high"}},
    }
    ingest = client.post("/api/v1/events/ingest/manual", json=payload)
    assert ingest.status_code == 200

    events_geo = client.get("/api/v1/geo/events?zoom=12&bbox=-3.9,40.3,-3.5,40.6")
    assert events_geo.status_code == 200
    body = events_geo.json()
    assert body["count"] >= 1
    assert body["type"] == "FeatureCollection"


def test_orbat_bulk_prevalidate_and_commit_v1() -> None:
    root = f"bulk-root-{uuid4().hex[:6]}"
    child = f"{root}-c1"
    nodes = [
        {"id": root, "name": "Bulk Root", "type": "command", "order": 0, "status": "active"},
        {"id": child, "parent_id": root, "name": "Bulk Child", "type": "team", "order": 0, "status": "active"},
    ]

    prevalidate = client.post("/api/v1/orbat/bulk/prevalidate", json={"nodes": nodes, "strict": True, "single_root": False})
    assert prevalidate.status_code == 200
    pre = prevalidate.json()
    assert pre["valid"] is True
    assert pre["nodes_count"] == 2

    commit = client.post("/api/v1/orbat/bulk/commit", json={"nodes": nodes, "strict": True, "single_root": False})
    assert commit.status_code == 200
    body = commit.json()
    assert body["commit"]["accepted"] is True
    assert body["commit"]["created"] == 2


def test_orbat_template_csv_validate_and_import_v1() -> None:
    root = f"tpl-root-{uuid4().hex[:6]}"
    child = f"{root}-t1"
    csv_content = (
        "id,parent_id,name,type,order,status,callsign,lat,lon\n"
        f"{root},,Tpl Root,command,0,active,,40.4168,-3.7038\n"
        f"{child},{root},Tpl Team,team,0,active,,40.4170,-3.7040\n"
    )

    validate = client.post(
        "/api/v1/orbat/templates/validate",
        json={"format": "csv", "content": csv_content, "strict": True, "single_root": False},
    )
    assert validate.status_code == 200
    val = validate.json()
    assert val["valid"] is True
    assert len(val["normalized_nodes"]) == 2

    imported = client.post(
        "/api/v1/orbat/templates/import",
        json={"format": "csv", "content": csv_content, "strict": True, "single_root": False},
    )
    assert imported.status_code == 200
    imp = imported.json()
    assert imp["commit"]["accepted"] is True
    assert imp["commit"]["created"] == 2


def test_orbat_tree_index_search_and_export_v1() -> None:
    root = f"tree-root-{uuid4().hex[:6]}"
    child = f"{root}-x"
    created = client.post(
        "/orbat",
        json={
            "units": [
                {"id": root, "name": "Tree Root", "type": "command", "echelon": "command", "status": "active"},
                {"id": child, "name": "Tree Child", "type": "team", "echelon": "team", "status": "active", "parent_id": root},
            ]
        },
    )
    assert created.status_code == 200

    tree = client.get(f"/api/v1/orbat/tree?root_id={root}&depth=2&q=child")
    assert tree.status_code == 200
    tree_payload = tree.json()
    assert tree_payload["root_count"] == 1
    assert tree_payload["nodes"][0]["id"] == root

    index = client.get(f"/api/v1/orbat/tree/index?root_id={root}")
    assert index.status_code == 200
    items = index.json()["items"]
    assert any(item["id"] == root for item in items)
    assert any(item["id"] == child for item in items)

    exported = client.get(f"/api/v1/orbat/{root}/export.json")
    assert exported.status_code == 200
    body = exported.json()
    assert body["template_version"] == "1.0"
    assert any(node["id"] == root for node in body["nodes"])


def test_c3is_gpx_import_validate_and_ingest_flow() -> None:
    unit_id = f"u-gpx-{uuid4().hex[:6]}"
    created = client.post(
        "/unit",
        json={
            "id": unit_id,
            "name": "GPX Unit",
            "type": "team",
            "echelon": "team",
            "status": "active",
        },
    )
    assert created.status_code == 200

    gpx_content = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="pytest">
  <trk>
    <name>alpha-track</name>
    <trkseg>
      <trkpt lat="40.4168" lon="-3.7038">
        <ele>650.0</ele>
        <time>2026-03-06T10:00:00Z</time>
      </trkpt>
      <trkpt lat="40.4170" lon="-3.7040">
        <time>2026-03-06T10:01:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"""
    imported = client.post(
        "/api/v1/c3is/gpx/import",
        json={"filename": "alpha.gpx", "content": gpx_content},
    )
    assert imported.status_code == 200
    import_id = imported.json()["import_id"]
    assert imported.json()["status"] == "uploaded"

    validated = client.post(f"/api/v1/c3is/gpx/import/{import_id}/validate")
    assert validated.status_code == 200
    val = validated.json()
    assert val["status"] == "ready_for_ingest"
    assert val["summary"]["track_count"] == 1
    assert val["summary"]["point_count"] == 2

    ingested = client.post(
        f"/api/v1/c3is/gpx/import/{import_id}/ingest",
        json={"unit_id": unit_id, "source": "network", "accuracy": 12},
    )
    assert ingested.status_code == 200
    body = ingested.json()
    assert body["status"] == "validated"
    assert body["ingest"]["ingested_points"] == 2

    positions = client.get(f"/positions/{unit_id}")
    assert positions.status_code == 200
    assert positions.json()["latest"]["unit_id"] == unit_id
    assert len(positions.json()["trail"]) >= 2


def test_c3is_gpx_validate_rejects_invalid_payload() -> None:
    imported = client.post(
        "/api/v1/c3is/gpx/import",
        json={"filename": "broken.gpx", "content": "<gpx><trk></gpx>"},
    )
    assert imported.status_code == 200
    import_id = imported.json()["import_id"]

    validated = client.post(f"/api/v1/c3is/gpx/import/{import_id}/validate")
    assert validated.status_code == 200
    body = validated.json()
    assert body["status"] == "rejected"
    assert any(issue["code"] == "invalid_xml" for issue in body["issues"])
