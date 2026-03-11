# ORBAT Geoespacial - Arquitectura Objetivo v1.2 (GeoTools Tacticas)

Fecha: 2026-03-09
Responsable: Architect

## Arquitectura propuesta

### Objetivo
Entregar un paquete inicial de GeoTools tacticas sobre el mapa actual sin romper los flujos activos de ORBAT, tracking, eventos, draw tools ni OGC services. La arquitectura debe maximizar valor visible en frontend y dejar un contrato minimo para evolucion posterior hacia persistencia e ingesta C3IS.

### Enfoque arquitectonico
Se mantiene el monolito modular actual con boundaries explicitos por motor y una integracion frontend incremental en `frontend/app.js`. No se fuerza microfrontend ni refactor estructural amplio en esta fase.

Capas:
1. `GeoMath`: logica geoespacial pura, sin DOM ni MapLibre, reutilizando formulas ya presentes y encapsulando conversiones, bearings, buffers simples, sectores, dispersion y export helpers.
2. `geoToolsState`: estado plano y serializable de la sesion GeoTools. No contiene instancias MapLibre ni nodos DOM.
3. `GeoTools`: adaptador de UI + mapa. Traduce eventos de toolbar/panel/clicks a operaciones de `GeoMath`, genera GeoJSON y actualiza `geotools-features`.
4. `Operational Data Adapters`: funciones de lectura de datos existentes (`st.units`, `st.geoFeatures`, `st.geoEvents`, `drawState.items`) expuestas como snapshots inmutables a GeoTools.
5. `C3IS GPX Bridge` fase 0: pipeline separado de carga y validacion de GPX, sin entrar en la ruta critica del tracking realtime.

### Boundaries por motor
- `ORBAT Engine`: sigue siendo la fuente de verdad de jerarquia, ids, parent-child y metadatos de unidad.
- `Geo Engine`: amplía su alcance con geometrias tacticas efimeras de GeoTools y futura persistencia opcional.
- `Graph Engine`: se usa como fuente conceptual para proximidad relacional y consultas futuras entre unidades relacionadas, pero no introduce motor adicional en esta fase.
- `Tracking Engine`: aporta latest position y trails; GeoTools solo consume snapshots de posicion, nunca escribe directamente en tracking.
- `Resource Engine`: sigue siendo la fuente de operadores y activos; GeoTools consulta atributos para filtros y export.

### Modulos propuestos
Frontend, sin reestructuracion agresiva:
- `frontend/app.js`
  - `GeoMath` como bloque puro o modulo extraible posterior.
  - `geoToolsState` junto al resto de estado global.
  - `GeoTools` como objeto paralelo a `MapWidgets`, `Favorites` y `OgcServices`.
- `frontend/index.html`
  - boton `GeoTools` en toolbar,
  - panel lateral `#geotools-panel`,
  - popups de parametros,
  - HUD de coordenadas/conversion.
- `frontend/style.css`
  - estilos `gt-*`, panel y popups propios.

Backend, solo contratos minimos de preparacion:
- `api/rest_api/main.py`
  - mantener APIs actuales sin bloqueo para GeoTools P0.
  - reservar endpoints GPX/C3IS bajo `/api/v1/c3is/...`.
- `geo/geo_engine/`
  - futura validacion y persistencia de geometria tactica exportable.
- `tracking/tracking_engine/`
  - futuro adaptador de ingest batch para trackpoints derivados de GPX.

### Integracion en `frontend/app.js`

#### Puntos de insercion permitidos
1. `st`:
   - añadir `geotools` como subestado unico.
2. `initMap()`:
   - registrar source `geotools-features` tras `measure-features`.
   - registrar layers `gt-*` antes de overlays no criticos y sin mezclar con `measure-*`.
3. `map.on('click')`, `map.on('mousemove')`, `map.on('dblclick')`:
   - enrutar eventos a `GeoTools` solo si el modo activo pertenece al namespace `gt-*`.
4. toolbar/panel:
   - boton `GeoTools` abre panel y activa herramienta.
5. `app.refreshGeo()` y `updateMapFeatures()`:
   - GeoTools consume snapshots ya materializados; no modifica `st.geoFeatures` ni `st.geoEvents`.

#### Dependencias permitidas
- `GeoTools` puede leer:
  - `map`,
  - `st.units`,
  - `st.geoFeatures`,
  - `st.geoEvents`,
  - `drawState.items`.
- `GeoTools` puede invocar:
  - `notify(...)`,
  - `logEvent(...)`,
  - helpers matematicos reutilizables o absorbidos en `GeoMath`.
- `GeoTools` no puede:
  - mutar `st.geoFeatures` ni `st.geoEvents`,
  - persistir unidades o eventos,
  - borrar `measure-features`,
  - cambiar contratos publicos existentes como `window.app.enableMapPick`.

#### Limites anti-acoplamiento
- Todos los modos GeoTools usan prefijo `gt-`.
- Todo feature generado por GeoTools viaja en source dedicado con `properties.ns = 'geotools'`.
- Ninguna herramienta lee DOM arbitrario; solo sus controles registrados.
- La seleccion de datos operativos se hace via adaptadores de snapshot, no leyendo capas MapLibre como fuente de verdad.
- Export GeoJSON opera sobre una seleccion explicitamente construida por GeoTools, no sobre todas las capas del mapa.

### Source y layers MapLibre

#### Source
- `geotools-features`: `FeatureCollection` efimera, reconstruible y aislada.

#### Convencion de layers `gt-*`
- `gt-rings-line`
- `gt-bearing-line`
- `gt-bearing-label`
- `gt-sector-fill`
- `gt-sector-line`
- `gt-proximity-hit`
- `gt-dispersion-fill`
- `gt-dispersion-outline`
- `gt-anchor-point`
- `gt-label`

Reglas:
- estilos propios, sin compartir filtro con `measure-*`.
- z-order por debajo de popups y por encima de `geo-features` cuando la herramienta necesite visibilidad tactica.
- `measure-clear` y `GeoTools.clear` deben actuar solo sobre su propio namespace.

### Arquitectura por herramienta

#### 1. Coord Converter
- Entrada manual o desde cursor/click.
- `GeoMath` normaliza DD como canon interno.
- Conversores de salida: DMS, UTM, MGRS.
- El HUD usa solo lectura; no persiste.

#### 2. Range Rings
- Anchor desde click, unidad o shape.
- Genera anillos como `LineString` poligonal aproximada.
- Parametros: radios, unidades, color opcional.

#### 3. Bearing & Distance
- Flujo de dos puntos.
- Salida: linea, label de rumbo/azimut y distancia.
- Canon de calculo sobre esfera ligera ya alineada con helpers existentes.

#### 4. Arc of Fire / Sector
- Anchor + bearing central + apertura + radio.
- Salida: fill + outline.
- Requiere validacion estricta de grados y clamp de aperturas.

#### 5. Proximity Query
- Fuente de consulta configurable: unidades, eventos, shapes locales.
- Resultado: subconjunto de features operativas dentro de un radio respecto a un anchor.
- P0 en frontend con snapshot local; P1 opcional con endpoint backend para volumen alto.

#### 6. Unit Dispersion
- Entrada: conjunto de unidades visible o seleccionado.
- Calcula envelope operacional simple para P0 usando centroide + radio maximo o hull simplificado sin libreria externa.
- No sustituye deployment zone ni geometrias ORBAT persistentes; es una capa analitica efimera.

#### 7. GeoJSON Export
- Exporta solo features GeoTools y, opcionalmente, referencias operativas relacionadas.
- Incluye `meta.tool`, `meta.created_at`, `meta.source_refs`.

## Modelos de datos

### `geoToolsState`
```json
{
  "panelOpen": false,
  "activeTool": null,
  "mode": "none",
  "cursor": { "lat": 0, "lon": 0 },
  "selection": {
    "anchor": null,
    "points": [],
    "sourceType": null,
    "sourceIds": []
  },
  "params": {
    "rings": { "radiiM": [100, 250, 500] },
    "bearing": { "units": "m" },
    "sector": { "radiusM": 250, "bearingDeg": 0, "spreadDeg": 60 },
    "proximity": { "radiusM": 250, "dataset": "units" },
    "dispersion": { "dataset": "visible-units" },
    "export": { "includeOperationalRefs": true }
  },
  "derived": {
    "features": [],
    "resultSummary": null,
    "converter": null
  }
}
```

### Feature contract `geotools-feature-v1`
Campos obligatorios:
- `type`
- `geometry`
- `properties.id`
- `properties.ns = "geotools"`
- `properties.tool`
- `properties.layer`
- `properties.ephemeral = true`

Campos opcionales:
- `properties.label`
- `properties.metric_value`
- `properties.metric_unit`
- `properties.source_refs[]`
- `properties.style_token`

### Snapshot de datos operativos consumidos
```json
{
  "units": [{ "id": "U1", "name": "Alpha", "lat": 40.4, "lon": -3.7, "echelon": "team", "freshness": "fresh" }],
  "events": [{ "id": "E1", "lat": 40.41, "lon": -3.69, "severity": "medium" }],
  "shapes": [{ "id": "S1", "type": "polygon", "points": [] }],
  "orbat": [{ "id": "U1", "parent_id": null, "type": "company" }]
}
```

### Contrato GPX/C3IS fase 0
```json
{
  "import_id": "uuid",
  "source": "gpx",
  "status": "uploaded|validated|rejected|ready_for_ingest",
  "summary": {
    "track_count": 0,
    "point_count": 0,
    "time_start": null,
    "time_end": null,
    "bbox": null
  },
  "issues": [
    { "code": "missing_time", "severity": "warn", "message": "Track point without timestamp" }
  ]
}
```

## APIs necesarias

### P0 sin bloqueo de backend
GeoTools puede operar enteramente en frontend sobre:
- `GET /api/v1/geo/features`
- `GET /api/v1/geo/events`
- `GET /positions/{unit}` o `/api/v1/tracking/positions/{unit}` segun flujo existente

### APIs recomendadas P1
- `POST /api/v1/geotools/export/validate`
  - valida FeatureCollection GeoTools antes de persistencia o intercambio.
- `POST /api/v1/geotools/export`
  - persiste export artefact si el negocio lo requiere.
- `POST /api/v1/geotools/proximity/query`
  - opcional para datasets grandes o filtros complejos backend.

### Linea C3IS GPX/GPS
- `POST /api/v1/c3is/gpx/import`
  - carga GPX crudo y devuelve `import_id`.
- `GET /api/v1/c3is/gpx/import/{import_id}`
  - resumen, errores y metadatos.
- `POST /api/v1/c3is/gpx/import/{import_id}/validate`
  - parseo, normalizacion y reglas de calidad.
- `POST /api/v1/c3is/gpx/import/{import_id}/ingest`
  - convierte a lote de tracking, fuera de la ruta critica realtime.
- `POST /api/v1/c3is/gps/bridge/register`
  - reservado para fase posterior con dispositivo real o bridge local.

### Reglas de contrato para C3IS
- GPX se trata como ingest batch o near-real-time, nunca compitiendo con el canal realtime principal.
- La validacion produce warning/error por punto y resumen global.
- La ingesta a tracking debe usar idempotencia por `source + external_track_id + timestamp`.

## Riesgos tecnicos

1. Conversion UTM/MGRS sin libreria externa puede introducir errores de borde en zonas, hemisferios y redondeos.
2. `frontend/app.js` ya concentra demasiadas responsabilidades; sin boundary claro, GeoTools puede degradar mantenibilidad.
3. Colisiones de eventos de mapa entre draw modes actuales, picks de favoritos, geocoding y nuevos modos `gt-*`.
4. Proximity/Dispersion sobre datasets grandes puede penalizar UI si se ejecuta de forma ingenua en cada movimiento.
5. Riesgo semantico: mezclar resultados analiticos efimeros de GeoTools con capas operativas persistentes.
6. GPX reales pueden llegar con timestamps inconsistentes, CRS ambiguo, waypoints sueltos o densidad de puntos muy alta.
7. Enlace futuro con GPS real puede requerir drivers, permisos locales o bridge de escritorio fuera del alcance web puro.

## Checklist de integracion y regresion

1. `geotools-features` existe y `clear` propio no afecta `measure-features`.
2. Los modos `gt-*` no rompen `line`, `polygon`, `buffer`, `note`, `erase`.
3. `Favorites.handleMapClick` y `pickCoordsMode` mantienen prioridad en sus flujos actuales.
4. ORBAT, tracking y eventos siguen visibles y clicables con GeoTools inactivo.
5. Coord HUD actualiza cursor sin degradar latencia perceptible del mapa.
6. Proximity usa snapshots y no muta `st.units`, `st.geoFeatures` ni `st.geoEvents`.
7. Export GeoJSON contiene solo geometria seleccionada y metadatos esperados.
8. El pipeline GPX detecta archivo invalido antes de cualquier ingest a tracking.

## Siguiente iteracion propuesta

1. Engineer: extraer `GeoMath` minimo y source/layers `geotools-features`.
2. Engineer: implementar `GeoTools.init()` con panel, HUD y routing de modos `gt-*`.
3. Engineer: entregar primero `Coord Converter`, `Range Rings` y `Bearing & Distance`.
4. Tester: validar matriz de regresion sobre mapa, draw tools, ORBAT, tracking, eventos y OGC.
5. Architect + Engineer: cerrar contrato `gpx_import_v1` con ejemplo real de archivo.
6. Director: decidir si `Unit Dispersion` P0 usa solo unidades visibles o tambien seleccion ORBAT filtrada.

## Archivos actualizados

- `coordination/10_architecture.md`
- `coordination/40_decisions.log`
- `coordination/outbox/architect.md`
