# Plan de Pruebas - ORBAT Geoespacial

Fecha: 2026-03-06  
Responsable: Tester

## Objetivo
Validar regresión y nuevas capacidades UI/API: geocoding + map-click (alta e ingesta), CRUD de unidades, capa de eventos en mapa y estabilidad del SLA de 1s.

## Alcance QA
- ORBAT: crear, editar, eliminar y reglas de seguridad en borrado.
- Tracking: ingestión, `no_track`, frescura y latencia.
- Geo ORBAT + Geo Events: visibilidad, filtros y consistencia.
- Events API v1: ingestión y timeline.
- Geocoding Nominatim: reverse, drafts y fallback.
- Frontend táctico: hooks de map-click, responsive y degradación offline.

## Tipos de test
- Unit tests.
- Integration tests.
- Scenario tests.
- Stress tests (pendiente ejecución completa).

## Escenarios críticos
1. Alta de unidad con `SET FROM MAP` + reverse geocoding.
2. Ingest position con map-click + dirección sugerida.
3. Edición de unidad (`PATCH`) con persistencia y refresco.
4. Eliminación segura (`DELETE` con `409` si hay hijos).
5. Eventos en mapa (`/api/v1/geo/events`) por tipo/fuente/severidad/tiempo.
6. Unidad sin tracking (`/positions/{unit}` retorna `status=no_track`).
7. Matriz responsive desktop/tablet/móvil + offline/recovery.

## Validación ejecutada (2026-03-06)
- `py -m pytest -q` -> `10 passed`.
- `node --check frontend/app.js` -> sin errores de sintaxis.
- CRUD unidades:
  - `POST /api/v1/units` -> `200`.
  - `PATCH /api/v1/units/{id}` -> `200` (persistencia verificada con `GET /unit/{id}`).
  - `DELETE /api/v1/units/{id}` -> `409` con hijos; `200` tras eliminar hijo.
- Tracking:
  - `GET /positions/{unit_sin_track}` -> `200` con `status=no_track`, `freshness=lost`.
  - `POST /position` (manual) -> `200` con caso observado `ingest_to_publish_ms=1004`, `freshness=stale`.
- Geocoding:
  - `POST /api/v1/geocoding/reverse` -> `200`.
- Event layer:
  - `POST /api/v1/events/ingest/bodycam` -> `200`.
  - `GET /api/v1/geo/events?...` -> `200`, features visibles con filtros.
- Frontend contract:
  - Hooks detectados: `enableMapPick` en alta e ingest.
  - Endpoints usados por front disponibles (`/units`, `/api/v1/geo/features`, `/api/v1/geo/events`, geocoding).

## Criterio de salida
- Cero errores bloqueantes en consola.
- Flujos críticos estables en desktop/tablet/móvil.
- p95 tracking <= 1s.

Estado actual:
- Parcialmente cumplido.
- Bloquea cierre QA: evidencia manual E2E por viewport aún no ejecutada.

## Problemas detectados
1. `source=gnss` sigue rechazado en tracking (`400 source is not supported`) y contradice escenario GNSS.
2. Latencia puntual observada de ingesta `1004ms` (>1s) en smoke; requiere medir p95/p99 bajo carga para confirmación.
3. Falta evidencia manual en navegador para confirmar estabilidad UI en desktop/tablet/móvil y criterio de “cero errores bloqueantes en consola”.
4. Riesgo operativo por dependencia Nominatim (quota/disponibilidad), pendiente validación de fallback bajo fallo del proveedor.

## Matriz de riesgos
| Riesgo | Impacto | Mitigación | Estado |
|---|---|---|---|
| GNSS no soportado | Alto | Alinear fuentes permitidas con requerimientos | Abierto |
| SLA 1s inestable en picos | Alto | Stress/soak + alertas p95/p99 | Abierto |
| Regresión visual responsive | Medio/Alto | Suite UI + checklist manual por viewport | Abierto |
| Dependencia Nominatim | Alto | Cache/rate-limit/fallback verificados con chaos tests | Abierto |
| Retención/auditoría sin cerrar | Medio | Definir criterios compliance de salida | Abierto |
