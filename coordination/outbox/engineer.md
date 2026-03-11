# Outbox Engineer

## 2026-03-09 - GeoTools P0 slice 1

## Modulo implementado
- Frontend GeoTools base integrado en mapa actual sin tocar contratos publicos existentes.
- `GeoMath` puro para:
  - conversion DD/DMS/UTM/MGRS,
  - bearing,
  - distancia,
  - generacion de range rings.
- `GeoTools` UI/state adapter con:
  - panel lateral flotante,
  - `Coord HUD`,
  - enrutado de modos `gt-converter`, `gt-rings`, `gt-bearing`,
  - export GeoJSON sobre source dedicado `geotools-features`.

## Codigo generado
- `frontend/geotools.js`
  - modulo nuevo con `window.GeoMath` y `window.GeoTools`.
- `frontend/app.js`
  - subestado `st.geotools`,
  - source `geotools-features`,
  - layers `gt-rings-line`, `gt-bearing-line`, `gt-anchor-point`, `gt-bearing-label`, `gt-label`,
  - exclusion mutua entre draw tools y modos `gt-*`,
  - exposicion controlada de globals necesarias para integracion.
- `frontend/index.html`
  - boton `GeoTools`,
  - panel `#geotools-panel`,
  - carga de `geotools.js`.
- `frontend/style.css`
  - estilos `gt-*` para panel, HUD y controles.

## Explicacion breve
La integracion es factible sobre el monolito actual sin rediseño agresivo. El primer slice deja la base operativa y visible de GeoTools usando un source aislado y modo propio para evitar colision con `measure-features`, ORBAT, tracking y eventos. Se cerraron ya las primeras herramientas de valor visible: converter, HUD, rings, bearing y export.

## Riesgos
- UTM/MGRS esta implementado sin libreria externa; requiere validacion de borde por zonas y hemisferios antes de considerarlo cerrado para precision operativa alta.
- Falta smoke/regresion manual en navegador para confirmar prioridad de clicks frente a `Favorites`, draw tools y picks de geocoding.
- `Sector`, `Proximity` y `Dispersion` siguen pendientes; no he tocado todavia consumo analitico de snapshots operativos para esos casos.

## Orden de ejecucion final
1. Base `GeoMath` + `GeoTools` + source/layers.
2. `Coord HUD` + converter.
3. `Range Rings`.
4. `Bearing & Distance`.
5. `Sector`.
6. `Proximity Query`.
7. `Unit Dispersion`.
8. Regresion funcional completa.
9. Linea C3IS GPX/GPS.

## Bloqueos o dependencias
- GPX/C3IS:
  - no hay aun dataset GPX real en repo para validar parseo,
  - no existe contrato backend implementado para `/api/v1/c3is/gpx/...`,
  - el enlace con GPS real sigue bloqueado por falta de decision de canal:
    - import batch,
    - near-real-time,
    - bridge local.
- Solicito al Architect confirmacion de criterio de precision aceptable para UTM/MGRS P0 antes de marcarlo como validado operativamente.

## Archivos modificados
- `frontend/geotools.js`
- `frontend/app.js`
- `frontend/index.html`
- `frontend/style.css`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`

## 2026-03-09 - GeoTools P0 slice 2

## Modulo implementado
- Extension del bloque tactico GeoTools sobre la base ya integrada.
- Herramientas nuevas:
  - `Arc of Fire / Sector`,
  - `Proximity Query`,
  - `Unit Dispersion`.
- UX adicional:
  - HUD con pin/unpin de cursor,
  - popups de parametros para sector, proximity y dispersion,
  - ampliacion de export con `source_refs` opcionales.

## Codigo generado
- `frontend/geotools.js`
  - nuevas funciones puras `buildSectorFeatures(...)`, `buildProximityFeatures(...)`, `buildDispersionFeatures(...)`,
  - snapshots operativos desde `st.geoFeatures`, `st.geoEvents` y `drawState.items`,
  - nuevos modos `gt-sector`, `gt-proximity`, `gt-dispersion`,
  - popup routing y pin/unpin de cursor.
- `frontend/app.js`
  - nuevos layers `gt-sector-fill`, `gt-sector-line`, `gt-proximity-hit`, `gt-dispersion-fill`, `gt-dispersion-outline`,
  - ampliacion de `st.geotools.params`.
- `frontend/index.html`
  - botones de herramientas tacticas adicionales,
  - popups de parametros,
  - controles de export y HUD ampliado.
- `frontend/style.css`
  - estilos de `gt-popup` y controles nuevos.

## Explicacion breve
El bloque tactico pendiente queda implementado sin introducir datasets paralelos ni tocar contratos backend. `Proximity` y `Dispersion` consumen snapshots operativos ya presentes en frontend, manteniendo el boundary definido por arquitectura. La parte C3IS sigue bloqueada por ausencia de GPX real y de contrato backend implementado.

## Riesgos
- `Proximity` y `Dispersion` estan resueltos en P0 sobre snapshots locales; para volumen alto seguira siendo razonable un endpoint backend P1.
- UTM/MGRS sigue necesitando validacion de borde.
- Falta smoke manual para certificar prioridad real de clicks frente a `Favorites`, `pickCoordsMode` y draw tools.

## Orden de ejecucion final
1. Cerrar smoke/regresion manual GeoTools vs mapa existente.
2. Refinar HUD/popup/layers pendientes.
3. Definir contrato backend C3IS para GPX.
4. Conseguir dataset GPX real y validar parseo.

## Bloqueos o dependencias
- No hay fichero GPX real en repo para validar import/parse.
- No existe aun implementacion backend de `/api/v1/c3is/gpx/...`.
- Si Architect exige precision operativa alta en MGRS, habra que validar y posiblemente corregir formulas de borde antes de cierre.

## Archivos modificados
- `frontend/geotools.js`
- `frontend/app.js`
- `frontend/index.html`
- `frontend/style.css`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`

## 2026-03-06 - Cierre tecnico iteraciones 9-11

## Modulo implementado
- Correccion de regresion map-click + geocoding con persistencia de draft.
- Extension de map-click + geocoding a `Ingest Position`.
- Revalidacion de edicion y eliminacion de unidades (API + UI).
- Revalidacion de capa de eventos georreferenciados en mapa desde Event API v1.
- Estabilizacion de arranque de tests frente a plugins externos de pytest.

## Codigo generado
- Backend (`api/rest_api/main.py`):
  - Nuevo endpoint `POST /api/v1/tracking/ingest/draft`.
  - Modelo `TrackingIngestDraftRequest`.
- Geocoding engine (`geocoding/geocoding_engine/application/services.py`):
  - Nuevo `TrackingIngestDraftInput`.
  - Nuevo metodo `create_tracking_ingest_draft(...)`.
  - Validacion explicita de coordenadas para drafts.
- Frontend (`frontend/app.js`):
  - Nuevo cliente API `createTrackingIngestDraft(...)`.
  - `map-click` ahora persiste draft en ambos flujos:
    - `add-unit` -> `POST /api/v1/units/draft`
    - `ingest` -> `POST /api/v1/tracking/ingest/draft`
  - Conservacion y limpieza controlada de `draft_id` por flujo.
- Tests (`tests/test_api.py`):
  - `test_create_tracking_ingest_draft_v1`.
  - `test_create_unit_v1_with_missing_draft_returns_404`.
- Documentacion/entorno:
  - `README.md` actualizado con comando recomendado de test determinista.
  - `coordination/20_tasks.md` actualizado a estado `DONE` para iteraciones 9-11.

## Explicacion breve
La regresion principal estaba en que el map-click rellenaba campos en memoria pero no garantizaba persistencia intermedia en `Ingest Position`. Se implemento el endpoint de draft faltante y se conecto el frontend para persistir coordenadas/geocoding inmediatamente tras el click en ambos flujos. Con esto se reduce la perdida de datos entre click y confirmacion final.

Adicionalmente se cerro la incidencia de bootstrap de pytest documentando y aplicando mitigacion contra autoload de plugins externos (`anyio.pytest_plugin`).

## Validacion automatica
- `py -m pytest -q` -> `12 passed`.
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; py -m pytest -q` -> `12 passed`.
- `py -m pytest --trace-config -o addopts='' -q` -> confirma carga de `anyio.pytest_plugin` cuando no se desactiva autoload.
- `node --check frontend/app.js` -> sin errores.

## Nota tecnica - incidencia pytest11/anyio
- Sintoma reportado: `KeyboardInterrupt` durante bootstrap de pytest al cargar plugins externos (`pytest11 -> anyio -> ssl`).
- Causa raiz identificada: autoload de plugin externo `anyio.pytest_plugin` en el entorno del usuario.
- Mitigacion permanente aplicada:
  1. `pytest.ini`: `addopts = -p no:anyio`.
  2. `README.md`: comando de ejecucion recomendado con autoload desactivado:
     - `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; py -m pytest -q`

## Pasos manuales reproducibles (smoke)
1. Abrir la app (`py -m uvicorn api.rest_api.main:app --reload`).
2. Alta de unidad:
   - abrir modal,
   - `SET FROM MAP`,
   - click en mapa,
   - verificar lat/lon y direccion,
   - crear unidad.
3. Ingest Position:
   - abrir modal,
   - `SET FROM MAP`,
   - click en mapa,
   - verificar lat/lon y direccion,
   - ingestar posicion.
4. Seleccionar unidad sin track: debe mostrarse `no_track` sin errores bloqueantes.
5. Editar unidad y validar persistencia.
6. Eliminar unidad sin hijos (OK) y probar unidad con hijos (`409`).
7. Refrescar eventos y validar puntos de eventos en mapa.

## Archivos modificados
- `api/rest_api/main.py`
- `geocoding/geocoding_engine/application/services.py`
- `frontend/app.js`
- `tests/test_api.py`
- `README.md`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`

## 2026-03-07 - Avance inicial Zona de Despliegue

## Modulo implementado
- Motor inicial de `deployment-zone` por nodo ORBAT en `geo_engine`.
- API de consulta de zona por nodo: `GET /api/v1/orbat/{id}/deployment-zone`.
- Sustitucion en frontend de capa de clustering por poligonos de zona.

## Codigo generado
- `geo/geo_engine/application/clustering.py`:
  - Refactor a `GeoDeploymentZoneService` (alias de compatibilidad: `GeoClusteringService`).
  - Generacion de zonas por arbol hijo con:
    - envolvente base (hull),
    - suavizado Chaikin,
    - fallback geometrico 0/1/2 puntos,
    - cache anti-jitter por nodo (`min_recalc_interval_ms`, `min_delta_m`).
  - Metadatos por zona: `zone_id`, `zone_version`, `generated_at`, `area_m2`, `member_count`, `quality_score`, `state`.
- `api/rest_api/main.py`:
  - `GET /api/v1/orbat/{id}/deployment-zone?include_members=1`.
  - `GET /api/v1/geo/features` ahora devuelve features `deployment-zone` + `units-point`.
- `frontend/app.js`:
  - Elimina render de `units-cluster`.
  - Añade capas `deployment-zone-fill` y `deployment-zone-line`.
  - Popup de inspeccion rapida por zona (estado, miembros, area).
- `tests/test_api.py`:
  - Actualizado test de geo para esperar `deployment-zone`.
  - Nuevo test de endpoint de zona por nodo ORBAT.
- `README.md`:
  - Documentados endpoints y comportamiento de deployment zone.

## Explicacion breve
Se implemento el primer vertical operativo del nuevo modelo de visualizacion territorial solicitado por dirección: cada nodo ORBAT agrupador con hijos georreferenciados publica una zona no circular suavizada y estable, con metadatos para inspeccion operativa. El frontend deja de depender de clustering y consume estas zonas directamente.

## Validacion automatica
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; py -m pytest -q` -> `14 passed`.
- `node --check frontend/app.js` -> sin errores.

## Riesgos/pendientes tecnicos
- Algoritmo base actual usa hull + suavizado (no alpha-shape adaptativo completo).
- Falta benchmark de rendimiento en ORBAT grande (P0.10 en progreso).
- Falta endpoint de consulta por lote de zonas (`/api/v1/deployment-zones`) para vistas extensas.

## Archivos modificados
- `geo/geo_engine/application/clustering.py`
- `api/rest_api/main.py`
- `frontend/app.js`
- `tests/test_api.py`
- `README.md`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`

## 2026-03-07 - Ajuste operativo solicitado (zoom + componentes de mapa)

## Modulo implementado
- Reglas de visualización ORBAT por zoom según solicitud del usuario.
- Componentización táctica del mapa para operación dinámica.

## Codigo generado
- Backend (`geo/geo_engine/application/clustering.py`):
  - Nuevo `layer=orbat-link` con líneas padre->hijo usando posiciones de tracking.
  - Regla de zoom `>=13`: `layer=deployment-zone` solo para nodos `command`.
  - Regla de zoom `<=11`: `layer=command-cluster` para agregación de command.
  - Se mantienen `units-point` para inspección y selección.
- Frontend (`frontend/app.js`, `frontend/index.html`, `frontend/style.css`):
  - Render de `orbat-link` (line), `deployment-zone` (fill/line), `command-cluster` (circle+label).
  - Click en `command-cluster` hace zoom contextual.
  - Widgets nuevos:
    - minimapa,
    - leyenda,
    - indicador norte,
    - zoom in / zoom out,
    - medición de distancia con 2 clicks.
  - Cache busting assets actualizado `20260307a`.
- Tests (`tests/test_api.py`):
  - contrato de zoom validado (`13` zona command + links, `11` cluster command).

## Explicacion breve
Se aplicó el comportamiento cartográfico solicitado: jerarquía visible por líneas, zona táctica enfocada a command en zoom operacional alto y compresión de command en zoom bajo. Además se añadió kit de herramientas de mapa para navegación e inspección rápida en operación real.

## Validacion automatica
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; py -m pytest -q` -> `14 passed`.
- `node --check frontend/app.js` -> sin errores.

## Archivos modificados
- `geo/geo_engine/application/clustering.py`
- `frontend/app.js`
- `frontend/index.html`
- `frontend/style.css`
- `tests/test_api.py`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`

## 2026-03-07 - Cambio solicitado: eliminar clusterizado

## Modulo implementado
- Eliminación completa del clusterizado geoespacial en backend y frontend.

## Codigo generado
- Backend (`geo/geo_engine/application/clustering.py`):
  - eliminado builder de `command-cluster`.
  - `build_features` ya no publica features de cluster en ningún zoom.
- Frontend:
  - `frontend/app.js`: eliminadas capas/map handlers `command-cluster` y `command-cluster-label`.
  - `frontend/index.html`: leyenda sin referencia a clusters.
  - `frontend/style.css`: removido estilo `swatch.cmd`.
- Tests (`tests/test_api.py`):
  - actualizado contrato: en zoom 11 se verifica ausencia de `command-cluster`.

## Validacion automatica
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; py -m pytest -q` -> `14 passed`.
- `node --check frontend/app.js` -> sin errores.

## Archivos modificados
- `geo/geo_engine/application/clustering.py`
- `frontend/app.js`
- `frontend/index.html`
- `frontend/style.css`
- `tests/test_api.py`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`

## 2026-03-07 - Ajuste final solicitado (sin zonas y sin minimapa)

## Modulo implementado
- Eliminacion completa de zonas de despliegue en mapa y en `GET /api/v1/geo/features`.
- Eliminacion de minimapa.
- Reemplazo de indicador norte por widget de brujula.

## Codigo generado
- Backend:
  - `geo/geo_engine/application/clustering.py`: ya no publica `deployment-zone` ni `command-cluster`; mantiene `orbat-link` + `units-point`.
  - `api/rest_api/main.py`: eliminado endpoint `GET /api/v1/orbat/{id}/deployment-zone`.
- Frontend:
  - `frontend/app.js`: eliminadas capas y popup de zonas; eliminada inicializacion de minimapa.
  - `frontend/index.html`: removido bloque `mini-map`; agregado componente `compass` con N/E/S/W.
  - `frontend/style.css`: estilos de brujula y eliminacion de estilos de minimapa.
- Tests:
  - `tests/test_api.py`: actualizados para validar ausencia de `deployment-zone` y clusters.

## Validacion automatica
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; py -m pytest -q` -> `13 passed`.
- `node --check frontend/app.js` -> sin errores.

## Archivos modificados
- `geo/geo_engine/application/clustering.py`
- `api/rest_api/main.py`
- `frontend/app.js`
- `frontend/index.html`
- `frontend/style.css`
- `tests/test_api.py`
- `README.md`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`

## 2026-03-07 - Ajuste final solicitado (sin brújula, medición avanzada)

## Modulo implementado
- Eliminada la brújula del mapa.
- Widget de medición rediseñado para:
  - líneas multi-segmento,
  - polígonos,
  - buffers,
  - etiquetas dinámicas (segmentos, total de línea y área de polígono/buffer),
  - notas en pantalla.

## Codigo generado
- Frontend (`frontend/app.js`):
  - nuevo estado y pipeline de dibujo (`line`, `polygon`, `buffer`, `note`).
  - fuente `measure-features` + capas de render/labels.
  - métricas dinámicas por segmento y total.
  - cálculo de área de polígonos y buffers.
  - notas mediante markers arrastrables.
- Frontend (`frontend/index.html`):
  - removida brújula.
  - panel de herramientas de medición ampliado (modos, finish, clear, buffer radius).
- Frontend (`frontend/style.css`):
  - estilos de herramientas y notas en pantalla.
  - eliminación de estilos de brújula.

## Validacion automatica
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; py -m pytest -q` -> `13 passed`.
- `node --check frontend/app.js` -> sin errores.

## Archivos modificados
- `frontend/app.js`
- `frontend/index.html`
- `frontend/style.css`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`

## 2026-03-07 - Implementación P0 ORBAT Management (alta masiva + ad hoc + árbol indexado)

## Módulo implementado
- Backend ORBAT management P0:
  - `POST /api/v1/orbat/bulk/prevalidate`
  - `POST /api/v1/orbat/bulk/commit`
  - `POST /api/v1/orbat/templates/validate`
  - `POST /api/v1/orbat/templates/import`
  - `GET /api/v1/orbat/templates/presets`
  - `GET /api/v1/orbat/tree`
  - `GET /api/v1/orbat/tree/index`
  - `GET /api/v1/orbat/{id}/export.json`
- Frontend P0:
  - Página alta masiva (`orbat_bulk.html`) con prevalidación y commit.
  - Página ad hoc (`orbat_ad_hoc.html`) con import JSON/CSV, presets y árbol dropdown.
  - Persistencia de expand/collapse en sesión (`sessionStorage`).

## Código generado
- API (`api/rest_api/main.py`):
  - Nuevos modelos request para bulk/template.
  - Validación estructural con errores/warnings por fila (`missing_parent`, `duplicate_id`, `cycle`, etc.).
  - Commit por lote con rollback parcial en fallo.
  - Parseo de plantilla canónica en JSON y CSV.
  - Árbol indexado con filtros por `root_id`, `depth`, `q`.
  - Export JSON de subárbol ORBAT.
- Frontend:
  - `frontend/orbat_bulk.html`.
  - `frontend/orbat_ad_hoc.html`.
  - `frontend/modules/orbat-bulk-create/index.js`.
  - `frontend/modules/orbat-ad-hoc-create/index.js`.
  - `frontend/modules/orbat-tree/index.js`.
  - `frontend/modules/orbat-templates/index.js`.
  - `frontend/index.html` actualizado con accesos a páginas ORBAT management.
- Tests:
  - `tests/test_api.py` ampliado con 3 pruebas:
    - bulk prevalidate/commit,
    - validate/import CSV template,
    - tree/index/export.

## Explicación breve
Se implementó el vertical P0 de gestión ORBAT sin modificar la arquitectura base existente y manteniendo compatibilidad con tracking/eventos/geoespacial. El flujo ahora permite validar lote antes de persistir, importar plantillas JSON/CSV de forma homogénea y navegar el árbol jerárquico con búsqueda y estado de expansión por sesión.

## Validación automatizada
- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD=1; py -m pytest -q` -> `16 passed`.
- `node --check` sobre módulos frontend nuevos -> OK.
- `py -m compileall api/rest_api/main.py` -> OK.

## Archivos modificados
- `api/rest_api/main.py`
- `frontend/index.html`
- `frontend/orbat_bulk.html`
- `frontend/orbat_ad_hoc.html`
- `frontend/modules/orbat-bulk-create/index.js`
- `frontend/modules/orbat-ad-hoc-create/index.js`
- `frontend/modules/orbat-tree/index.js`
- `frontend/modules/orbat-templates/index.js`
- `tests/test_api.py`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`

## 2026-03-10 - C3IS GPX backend slice 1

## Modulo implementado
- Backend C3IS GPX fase 0 integrado sobre `tracking_engine` y `rest_api`.
- Flujo REST operativo:
  - `POST /api/v1/c3is/gpx/import`
  - `GET /api/v1/c3is/gpx/import/{import_id}`
  - `POST /api/v1/c3is/gpx/import/{import_id}/validate`
  - `POST /api/v1/c3is/gpx/import/{import_id}/ingest`

## Codigo generado
- `tracking/tracking_engine/domain/gpx_entities.py`
  - entidades `GpxImport`, `GpxImportSummary`, `GpxIssue`, `GpxTrackPoint`.
- `tracking/tracking_engine/ports/gpx_repository.py`
  - puerto de repositorio para imports GPX.
- `tracking/tracking_engine/adapters/in_memory_gpx_repository.py`
  - adaptador en memoria para fase 0.
- `tracking/tracking_engine/application/gpx_service.py`
  - carga, parseo XML GPX, validacion, resumen, incidencias e ingesta batch a tracking.
- `api/rest_api/main.py`
  - wiring del servicio y endpoints `/api/v1/c3is/gpx/...`.
- `tests/test_api.py`
  - pruebas de flujo valido e invalido.

## Explicacion breve
Se abrió la línea C3IS sin alterar la arquitectura definida: el core queda en `tracking_engine` con puerto/adaptador propios y la API solo actúa como thin controller. El slice actual permite cargar GPX como texto, validarlo, obtener resumen (`track_count`, `point_count`, rango temporal, `bbox`, incidencias) e ingerirlo a `TrackingService` como lote.

## Riesgos
- La validacion ya cubre XML roto, coordenadas invalidas y timestamps ausentes/invalidos, pero aun falta contrastarla con un GPX real del negocio.
- La idempotencia actual evita duplicados dentro de la misma ingesta por `unit_id + external_track_id + timestamp`; no cubre deduplicacion cruzada entre imports distintos.
- El contrato de entrada sigue siendo JSON con `content`; para carga de fichero real o bridge local haran falta decisiones de transporte.

## Orden de ejecucion final
1. Implementar slice backend GPX con repositorio/servicio propio.
2. Exponer endpoints REST C3IS.
3. Validar flujo automatizado de importacion, validacion e ingesta.
4. Pendiente: probar con dataset GPX real y definir bridge GPS real.

## Bloqueos o dependencias
- Falta un GPX real en repo o facilitado por negocio para validar corner cases.
- Falta decision de Architect/Director sobre:
  - idempotencia inter-import,
  - modo de enlace GPS real,
  - si la carga final sera `multipart`, batch programado o bridge local.

## Archivos modificados
- `tracking/tracking_engine/domain/gpx_entities.py`
- `tracking/tracking_engine/ports/gpx_repository.py`
- `tracking/tracking_engine/adapters/in_memory_gpx_repository.py`
- `tracking/tracking_engine/application/gpx_service.py`
- `tracking/tracking_engine/domain/__init__.py`
- `tracking/tracking_engine/ports/__init__.py`
- `tracking/tracking_engine/adapters/__init__.py`
- `tracking/tracking_engine/application/__init__.py`
- `api/rest_api/main.py`
- `tests/test_api.py`
- `coordination/20_tasks.md`
- `coordination/outbox/engineer.md`
