# ORBAT Geoespacial - Project Brief

## Estado
- Fecha de actualización: 2026-03-09
- Estado del blackboard: ACTIVO
- Dirección actual: priorizar un paquete inicial de GeoTools tácticas sobre la experiencia geoespacial existente, acopladas al frontend y backend actual sin forzar arquitectura ni romper flujos previos.

## Visión
Construir una plataforma ORBAT geoespacial operativa para un TOC táctico, con visualización cartográfica, jerarquía ORBAT, eventos y tracking, y una capa de geoprocesamiento táctico útil para planificación, navegación, análisis rápido y exportación interoperable.

## Alcance de la fase actual
1. Incorporar un paquete inicial de 7 GeoTools en el mapa:
   - conversión de coordenadas DD/DMS/UTM/MGRS,
   - range rings,
   - bearing & distance,
   - arc of fire / sector,
   - proximity query,
   - unit dispersion,
   - exportación GeoJSON.
2. Integrar la UX de GeoTools en el patrón actual del frontend:
   - botón `⊕ GeoTools` en toolbar,
   - panel lateral `#geotools-panel`,
   - popups pequeños para parámetros,
   - HUD de coordenadas,
   - source/layers MapLibre independientes de `measure-features`.
3. Reutilizar utilidades matemáticas y patrones visuales ya existentes en `frontend/app.js`, `frontend/index.html` y `frontend/style.css`.
4. Mantener compatibilidad con ORBAT, tracking, eventos, OGC services y herramientas de dibujo actuales.
5. Abrir línea C3IS para ingestión de datos GPX de prueba y posterior enlace con dispositivo GPS real.

## Restricciones técnicas conocidas
- Mapa base actual: MapLibre.
- No usar librerías externas de análisis espacial como `turf.js`.
- Reutilizar cálculos y proyecciones custom ya presentes en el proyecto.
- No mezclar las features de GeoTools con `measure-features` ni con acciones de borrado existentes.
- Integrar sin imponer cambios estructurales innecesarios en frontend ni backend.

## Lineamientos de dirección
1. Entregar primero valor visible y verificable en mapa.
2. Favorecer módulos puros y testeables para la parte matemática.
3. Separar claramente:
   - lógica geoespacial pura,
   - estado UI de herramientas,
   - rendering MapLibre,
   - integración con datos ORBAT/unidades/eventos.
4. Tratar GPX/GPS como línea paralela C3IS, no como bloqueo del paquete GeoTools inicial.

## Requisitos funcionales clave
1. El operador debe poder activar GeoTools desde la toolbar sin abandonar el mapa.
2. Cada herramienta debe producir feedback visual inmediato y ser reversible sin afectar otras capas.
3. Las herramientas deben operar sobre datos existentes del sistema cuando aplique:
   - unidades con posición,
   - eventos,
   - geometrías dibujadas,
   - ORBAT cargado.
4. La exportación GeoJSON debe permitir interoperabilidad con geometrías generadas y, cuando aplique, datos operativos relacionados.
5. Debe existir un flujo verificable para:
   - obtener datos GPX de prueba,
   - validarlos,
   - preparar el posterior enlace con GPS real.

## Prioridades inmediatas
### P0
1. Validar arquitectura inicial de GeoTools y puntos de integración.
2. Definir backlog ejecutable para Engineer con orden de implementación por valor/riesgo.
3. Validar plan de pruebas funcionales y regresión para Tester.
4. Acordar alcance técnico de la línea C3IS para GPX/GPS.

### P1
1. Coord Converter y Coord HUD.
2. Range Rings.
3. Bearing & Distance.
4. Sector / Arc of Fire.
5. Proximity Query.
6. Unit Dispersion.
7. GeoJSON Export.

### P2
1. Pipeline de prueba con archivos GPX reales.
2. Evaluación de dispositivo GPS para enlace posterior.
3. Integración futura con sensores o drones.

## Riesgos actuales
1. Complejidad matemática de UTM/MGRS sin librería externa.
2. Riesgo de acoplamiento excesivo en `frontend/app.js` si no se modulariza bien.
3. Posibles regresiones sobre modos de dibujo y capas existentes.
4. Ambigüedad aún no resuelta sobre tipo de cliente objetivo y tamaño operativo esperado.
5. Línea GPX/GPS puede derivar en necesidades de ingestión, sincronización o drivers no definidas todavía.

## Decisiones pendientes de negocio
1. Tipo de empresas de seguridad objetivo.
2. Tamaño esperado del ORBAT:
   - promedio,
   - máximo,
   - volumen simultáneo de unidades en mapa.
3. Confirmación de tracking en tiempo real.
4. Sistema de mapas definitivo además de la base actual MapLibre.
5. Prioridad y alcance de integración con sensores o drones.

## Decisiones pendientes técnicas
1. Alcance exacto del export GeoJSON inicial.
2. Fuente de datos y formato de entrada para Proximity Query y Unit Dispersion.
3. Estrategia de validación de UTM/MGRS.
4. Contrato inicial para ingestión GPX.
5. Estrategia de enlace posterior con GPS real:
   - import batch,
   - streaming,
   - bridge local,
   - API externa.

## Entregables inmediatos
- Arquitectura inicial de GeoTools y su integración con frontend/backend.
- Backlog priorizado con dependencias y orden de entrega.
- Mensajes de coordinación a Architect, Engineer y Tester.
- Definición inicial de la línea C3IS para GPX/GPS.
