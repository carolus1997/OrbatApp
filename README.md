# ORBAT Geospatial Platform (Vertical Slice P0)

## Quick start (Windows + PowerShell)

> Si te sale `pip/uvicorn/pytest no se reconoce`, usa siempre `py -m ...` dentro de un entorno virtual.

1. Verificar Python:

```powershell
py --version
```

Si falla, instala Python 3.11+ desde https://www.python.org/downloads/ y marca `Add python.exe to PATH`.

2. Crear y activar entorno virtual:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

3. Instalar dependencias:

```powershell
py -m pip install --upgrade pip
py -m pip install -r requirements.txt
```

4. Arrancar backend (FastAPI + frontend estático):

```powershell
py -m uvicorn api.rest_api.main:app --reload
```

5. Abrir aplicación:

- Frontend + API: http://127.0.0.1:8000
- Docs API (Swagger): http://127.0.0.1:8000/docs

6. Ejecutar tests:

```powershell
# recomendado para evitar plugins externos del sistema
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
py -m pytest -q
```

## Frontend

- El frontend está en:
  - `frontend/index.html`
  - `frontend/style.css`
  - `frontend/app.js`
- No necesita `npm` para este vertical slice.
- Se sirve automáticamente desde FastAPI con `StaticFiles` al ejecutar:
  - `py -m uvicorn api.rest_api.main:app --reload`
- Endpoint principal que consume el mapa:
  - `GET /api/v1/geo/features?zoom={z}&layer=orbat&bbox=minLon,minLat,maxLon,maxLat`

## Implemented modules

- `orbat/orbat_engine`: hierarchical unit model, no-cycle validation, tree snapshot.
- `tracking/tracking_engine`: position ingest, latest state, trail and freshness (`fresh/stale/lost`).
- `geo/geo_engine`: initial projection utility scaffold.
- `graph/graph_engine`: initial domain scaffold.
- `api/rest_api`: basic endpoints requested by project coordination.

## Basic APIs

- `POST /orbat`
- `GET /orbat/{id}`
- `POST /unit`
- `GET /unit/{id}`
- `POST /position`
- `GET /positions/{unit}`
- `GET /api/v1/geo/features?zoom={z}&layer=orbat&bbox=minLon,minLat,maxLon,maxLat`
- `POST /api/v1/events/ingest/{source}`
- `GET /api/v1/events/timeline?unit=...&from_ts=...&to_ts=...&sources=...&limit=...&cursor=...`
- `POST /api/v1/geocoding/reverse`
- `POST /api/v1/units/draft`
- `POST /api/v1/tracking/ingest/draft`
- `POST /api/v1/units`

## Notes

- Current persistence is in-memory to accelerate vertical slice delivery.
- Tracking response includes `ingest_to_publish_ms` to support latency monitoring aligned with 1s objective.
- Geo endpoint publishes:
  - `orbat-link`: línea padre-hijo por jerarquía con unidades georreferenciadas.
  - `units-point`: posiciones individuales para inspección/selección.

## Frontend P0

- Frontend files:
  - `frontend/index.html`
  - `frontend/style.css`
  - `frontend/app.js`
- Front now consumes aggregated endpoint `GET /api/v1/geo/features` to reduce fan-out calls.
- Unit create flow supports map click -> reverse geocoding -> draft -> final unit create.
- Responsive tactical behavior:
  - Desktop (`>=1280px`): TOC + map + detail panel.
  - Tablet (`768-1279px`): right panel collapsible.
  - Mobile (`<=767px`): map-first, side panels via header toggles.
- Offline/error handling:
  - network/API banner
  - retry checks
  - event-log error traces
- Perceived latency metric:
  - footer stat `RENDER` reports ingest->visual refresh latency in ms.
