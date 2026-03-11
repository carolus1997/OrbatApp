# Backlog Inicial - ORBAT Geoespacial

## Estado verificado de implementación (2026-03-09)

### Done
0. Iteracion C3IS GPX backend 2026-03-10:
   - endpoints `/api/v1/c3is/gpx/import`, `/validate`, `/ingest` implementados,
   - parseo GPX backend base implementado,
   - resumen `track_count/point_count/time/bbox/issues` implementado,
   - ingesta batch a `tracking` implementada,
   - pruebas API añadidas.
0. Iteracion GeoTools tactico 2026-03-09:
   - `Arc of Fire / Sector` implementado.
   - `Proximity Query` implementado.
   - `Unit Dispersion` implementado.
   - `GeoJSON Export` ampliado con `source_refs` opcionales.
   - HUD ampliado con pin/unpin.
   - layers `gt-*` para sector, proximity y dispersion añadidos.
1. Base inicial de `GeoMath` para:
   - conversión DD/DMS/UTM/MGRS,
   - range rings,
   - bearing.
2. Base inicial de `GeoTools` integrada en frontend.
3. Source `geotools-features` creado e integrado en MapLibre.
4. Panel lateral GeoTools operativo.
5. Routing inicial de modos `gt-*` en `MapWidgets.setMode()`.
6. `Coord Converter` implementado.
7. `Range Rings` implementado.
8. `Bearing & Distance` implementado.
9. `GeoJSON Export` básico implementado.

### In Progress
0. Iteracion C3IS GPX backend 2026-03-10:
   - falta validar con dataset GPX real,
   - falta cerrar idempotencia inter-import,
   - falta definir bridge GPS real.
0. Iteracion GeoTools tactico 2026-03-09:
   - smoke/regresion manual pendiente,
   - refinado HUD/popup/layers pendiente,
   - validacion de aislamiento `measure-features` pendiente.
1. Verificar que `clear` de GeoTools no afecte `measure-features`.
2. Ejecutar regresión funcional sobre mapa, ORBAT, tracking y eventos.

### Pending
0. Iteracion GeoTools tactico 2026-03-09:
   - linea C3IS sin dataset GPX real todavia,
   - precision UTM/MGRS pendiente de validacion de borde.
1. Implementar `Arc of Fire / Sector`.
2. Implementar `Proximity Query`.
3. Implementar `Unit Dispersion`.
4. Completar HUD de coordenadas:
   - 4 formatos,
   - pin/unpin,
   - comportamiento dedicado.
5. Implementar popups de parámetros:
   - `gt-rings-popup`,
   - `gt-sector-popup`.
6. Completar layers `gt-*` faltantes para:
   - sector,
   - proximity,
   - dispersion,
   - labels y fills pendientes.
7. Ampliar `GeoJSON Export` al alcance operativo acordado.
8. Abrir línea C3IS:
   - obtener datos GPX de prueba,
   - validar parseo con dataset real,
   - documentar siguiente paso para enlace GPS real.

## Prioridad P0
1. Completar el bloque táctico GeoTools:
   - `Arc of Fire / Sector`,
   - `Proximity Query`,
   - `Unit Dispersion`.
2. Completar la UI/UX faltante de GeoTools:
   - HUD completo,
   - popups de parámetros,
   - estados visuales y mensajes de modo `gt-*`.
3. Completar layers `gt-*` faltantes en MapLibre.
4. Definir contrato de integración entre GeoTools y datos existentes:
   - unidades,
   - eventos,
   - ORBAT,
   - shapes locales.
5. Ampliar `GeoJSON Export`.
6. Verificar aislamiento respecto a `measure-features`.
7. Ejecutar regresión funcional sobre mapa, ORBAT, tracking y eventos.
8. Abrir línea C3IS:
   - obtener datos GPX de prueba,
   - validar parseo con dataset real,
   - documentar siguiente paso para enlace GPS real.

## Prioridad P1
1. Refinar precisión y validación de UTM/MGRS.
2. Mejorar feedback visual y labels dinámicos de todas las GeoTools.
3. Conectar `Proximity Query` y `Unit Dispersion` a datasets operativos reales del sistema.
4. Definir contrato backend/API para ingestión GPX.
5. Evaluar estrategia de enlace con GPS real.

## Prioridad P2
1. Integración con sensores.
2. Integración con drones.
3. Persistencia o rehidratación de resultados GeoTools por sesión/misión.
4. Automatización de pruebas con datasets tácticos más amplios.

## Orden de implementación recomendado
1. `Arc of Fire / Sector`.
2. `Proximity Query`.
3. `Unit Dispersion`.
4. HUD completo y popups de parámetros.
5. Layers `gt-*` y feedback visual faltante.
6. Ampliación de `GeoJSON Export`.
7. Línea C3IS GPX/GPS.

## Asignación por rol
- Architect:
  - validar el cierre del bloque táctico sobre la base GeoTools ya integrada,
  - definir contratos de integración con capas/datos existentes,
  - revisar riesgos de acoplamiento y regresión,
  - proponer estrategia inicial para GPX/GPS.
- Engineer:
  - completar el bloque táctico sobre la base GeoTools existente,
  - acoplar Proximity/Dispersion con datos operativos existentes,
  - completar UI/MapLibre faltante sin rediseñar la integración actual,
  - preparar la base técnica para ingestión GPX.
- Tester:
  - validar lo ya implementado,
  - definir matriz de prueba del bloque táctico pendiente,
  - validar no regresión en mapa y modos existentes,
  - preparar casos de prueba para GPX/GPS.

## Criterios de cierre de esta fase
1. Toolbar y panel GeoTools operativos en mapa.
2. Las 7 herramientas producen salida visible y verificable.
3. No hay regresiones en ORBAT, tracking, eventos ni draw tools existentes.
4. Exportación GeoJSON funcional con el alcance acordado.
5. Existe evidencia de prueba para al menos un dataset GPX y un plan concreto para enlace GPS real.

## Estado de coordinación (2026-03-09)
- Foco de dirección actualizado hacia GeoTools tácticas con integración no disruptiva.
- Verificación realizada: la base GeoTools ya existe parcialmente en frontend.
- Prioridad efectiva actual: completar el bloque táctico pendiente.
- La línea previa de ORBAT, tracking y eventos se mantiene como baseline que no debe romperse.
- Se incorpora como pendiente C3IS la obtención de GPX de prueba y posterior enlace con GPS real.
