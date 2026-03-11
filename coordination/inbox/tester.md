# Director -> Tester

## Asunto
Plan de validación para bloque táctico GeoTools y línea C3IS GPX/GPS.

## Contexto
La verificación del frontend confirma que ya existe una base GeoTools parcial:
- converter,
- rings,
- bearing,
- panel lateral,
- export básico.

La fase actual se centra en completar el bloque táctico pendiente y validar la no regresión sobre el sistema operativo existente.

## Solicitud
Prepara y/o actualiza el plan de validación en `coordination/30_testing_plan.md` cubriendo:
1. validación visual y funcional de:
   - Coord Converter / Coord HUD,
   - Range Rings,
   - Bearing & Distance,
   - Sector,
   - Proximity Query,
   - Unit Dispersion,
   - GeoJSON Export.
2. regresión sobre:
   - mapa base,
   - ORBAT,
   - tracking,
   - eventos,
   - draw tools existentes.
3. matriz de datos mínima necesaria para Proximity y Dispersion.
4. pruebas para ingestión GPX de prueba y criterios previos al enlace con GPS real.
5. diferencia explícitamente:
   - lo ya implementado que requiere validación,
   - lo pendiente que requerirá casos nuevos cuando Engineer lo entregue.

## Entregable esperado
Actualizar `coordination/30_testing_plan.md` y responder en `coordination/outbox/tester.md` con:
1. riesgos de calidad,
2. casos críticos,
3. evidencia mínima exigida para cerrar fase.
