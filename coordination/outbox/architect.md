# Architect -> Director

## Arquitectura propuesta

Se valida la separacion solicitada y se mantiene el monolito modular actual. La base recomendada para esta fase es:
- `GeoMath` como modulo puro y testeable para conversiones, bearings, sectores, buffers simples, dispersion y export helpers.
- `geoToolsState` como estado plano de sesion, serializable y sin dependencias MapLibre/DOM.
- `GeoTools` como adaptador de UI + mapa, paralelo a `MapWidgets`, encargado de eventos de toolbar/panel, generacion de GeoJSON y refresco del source dedicado.

La integracion en `frontend/app.js` debe limitarse a cinco puntos: extender `st` con `geotools`, registrar `geotools-features`, registrar layers `gt-*`, enrutar eventos de mapa solo cuando el modo activo sea `gt-*` y consumir snapshots de `st.units`, `st.geoFeatures`, `st.geoEvents` y `drawState.items` sin mutarlos.

## Modelos de datos

Queda definido `geoToolsState` como contrato de sesion y `geotools-feature-v1` como contrato de feature efimera. La geometria interna canonica es GeoJSON y la coordenada canonica para calculo es DD; DMS/UTM/MGRS son vistas derivadas. Tambien queda definido `gpx_import_v1` como contrato inicial para la linea C3IS.

## APIs necesarias

Para P0 no hace falta bloquear al Engineer con backend nuevo: GeoTools puede montar sobre `GET /api/v1/geo/features`, `GET /api/v1/geo/events` y el acceso actual a posiciones. Como preparacion de P1/C3IS, recomiendo reservar:
- `POST /api/v1/geotools/export/validate`
- `POST /api/v1/geotools/export`
- `POST /api/v1/geotools/proximity/query`
- `POST /api/v1/c3is/gpx/import`
- `GET /api/v1/c3is/gpx/import/{import_id}`
- `POST /api/v1/c3is/gpx/import/{import_id}/validate`
- `POST /api/v1/c3is/gpx/import/{import_id}/ingest`

## Riesgos tecnicos

- Precision UTM/MGRS sin libreria externa.
- Colisiones entre modos actuales de mapa y nuevos modos `gt-*`.
- Coste de calculo en frontend para proximity/dispersion si se ejecuta sin snapshots ni throttling.
- Riesgo de contaminar capas operativas si no se respeta el source dedicado.
- Variabilidad y calidad de ficheros GPX reales antes del enlace con GPS fisico.

## Archivos actualizados

- `coordination/10_architecture.md`
- `coordination/40_decisions.log`
- `coordination/outbox/architect.md`

## Observacion de trade-off

La decision clave es pragmatica: entregar primero GeoTools visibles y aisladas en frontend, dejando persistencia, consultas pesadas y puente GPS real para una siguiente iteracion, sin tocar la ruta critica de tracking en tiempo real.
