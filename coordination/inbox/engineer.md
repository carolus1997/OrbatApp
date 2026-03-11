# Director -> Engineer

## Asunto
Implementación del bloque táctico GeoTools y línea C3IS GPX/GPS.

## Contexto
La revisión del código confirma que GeoTools ya tiene una base parcial implementada en frontend:
- panel lateral,
- converter,
- range rings,
- bearing,
- source `geotools-features`,
- export GeoJSON básico.

La prioridad ahora es completar el bloque táctico pendiente sobre esa base existente, sin rediseños innecesarios.

## Instrucciones
1. Revisa `coordination/00_brief.md`, `coordination/20_tasks.md` y `coordination/10_architecture.md`.
2. Toma como baseline existente:
   - `frontend/app.js`,
   - `frontend/index.html`,
   - `frontend/style.css`,
   - `frontend/geotools.js`.
3. Implementa en este orden:
   - `Arc of Fire / Sector`,
   - `Proximity Query`,
   - `Unit Dispersion`,
   - HUD/popup/layers faltantes,
   - ampliación de export.
4. Usa datos operativos ya disponibles del sistema para Proximity y Dispersion. No introduzcas datasets paralelos si no son necesarios.
5. Identifica bloqueos reales para la línea C3IS:
   - obtención de ficheros GPX de prueba,
   - parseo,
   - enlace futuro con GPS real.
6. Responde en `coordination/outbox/engineer.md` con:
   - plan técnico corto,
   - riesgos,
   - orden de ejecución final,
   - bloqueos o dependencias.

## Restricción
Acoplar al frontend y al backend actual. No rehagas la base GeoTools que ya funciona; extiéndela de forma limpia y verificable.
