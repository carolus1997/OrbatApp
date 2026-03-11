# Tester -> Director

Fecha: 2026-03-06

## Tipo de test
Unit tests + Integration tests (regresión backend)

## Escenario
Ejecución de suite y validación de APIs core + nuevas APIs de ciclo de vida.

## Resultado esperado
- Suite en verde.
- CRUD de unidades estable.
- Tracking sin regresiones de contrato.

## Resultado observado
- `py -m pytest -q` -> `10 passed`.
- `POST /api/v1/units` -> `200`.
- `PATCH /api/v1/units/{id}` -> `200` (persistencia confirmada con `GET /unit/{id}`).
- `DELETE /api/v1/units/{id}`:
  - con hijo -> `409` (correcto),
  - tras eliminar hijo -> `200`.
- `GET /positions/{unit}` sin track -> `200` con `status=no_track`.

## Problemas detectados
- Ningún fallo funcional bloqueante en CRUD/contratos base.

---

## Tipo de test
Integration tests (Geocoding + map-click contract)

## Escenario
Reverse geocoding para flujos de alta e ingestión por click en mapa.

## Resultado esperado
- Geocoding responde y el front dispone de hooks para poblar formularios.

## Resultado observado
- `POST /api/v1/geocoding/reverse` -> `200`.
- Hooks frontend detectados: `enableMapPick()` en alta (`add-unit`) e ingesta (`ingest`).
- `node --check frontend/app.js` -> sin errores.

## Problemas detectados
- Riesgo operativo pendiente por dependencia externa Nominatim (quota/disponibilidad).

---

## Tipo de test
Integration tests (Event API + capa de eventos en mapa)

## Escenario
Ingestión de evento + visualización geoespacial filtrada.

## Resultado esperado
- Evento aceptado y visible en `geo/events` según filtros.

## Resultado observado
- `POST /api/v1/events/ingest/bodycam` -> `200`.
- `GET /api/v1/geo/events?...` -> `200`, features visibles con filtros.

## Problemas detectados
- Sin fallos funcionales bloqueantes en esta ronda para Event Geo Layer.

---

## Tipo de test
Scenario tests (Tracking SLA + GNSS)

## Escenario
Validación de objetivo 1s y compatibilidad con escenario GNSS.

## Resultado esperado
- `ingest_to_publish_ms <= 1000` en objetivo operacional.
- Fuente GNSS aceptada para escenario de tracking 1h.

## Resultado observado
- Ingesta manual observada: `ingest_to_publish_ms=1004`, `freshness=stale`.
- `source=gnss` en `/position` -> `400` (`source is not supported`).

## Problemas detectados
- Brecha funcional GNSS (alto impacto).
- Riesgo de incumplimiento SLA 1s: observado caso puntual por encima de umbral; falta confirmar p95/p99 con stress.

---

## Tipo de test
Frontend QA (responsive + estabilidad operacional)

## Escenario
Criterio de salida del Director: cero errores bloqueantes en consola y estabilidad en desktop/tablet/móvil.

## Resultado esperado
- Flujos críticos estables en los 3 viewports y sin errores bloqueantes en consola.

## Resultado observado
- Contratos API consumidos por frontend disponibles.
- Verificación estática correcta.
- No se ejecutó en esta ronda validación manual E2E por viewport en navegador.

## Problemas detectados
- Falta evidencia manual/automatizada UI para cerrar criterio de salida solicitado.
