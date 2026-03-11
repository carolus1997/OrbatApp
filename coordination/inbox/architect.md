# Director -> Architect

## Asunto
Arquitectura inicial de GeoTools tácticas para ORBAT Geoespacial.

## Contexto
La prioridad actual ya no es la expansión de gestión ORBAT masiva. El foco es entregar un paquete inicial de GeoTools tácticas sobre el mapa actual, integradas con MapLibre, ORBAT, unidades y eventos existentes, sin forzar backend ni frontend.

Herramientas objetivo:
1. Coord Converter (DD/DMS/UTM/MGRS)
2. Range Rings
3. Bearing & Distance
4. Arc of Fire / Sector
5. Proximity Query
6. Unit Dispersion
7. GeoJSON Export

Restricciones:
- sin `turf.js`,
- reutilizar matemáticas y proyecciones ya presentes,
- source/layers separados de `measure-features`,
- integración compatible con toolbar, draw modes y flujos actuales.

## Solicitud
1. Validar o corregir la separación propuesta entre:
   - `GeoMath` como módulo puro,
   - `geoToolsState` como estado plano,
   - `GeoTools` como integración UI/mapa.
2. Definir la arquitectura de integración en `frontend/app.js`:
   - puntos de inserción,
   - dependencias permitidas,
   - límites para evitar acoplamiento excesivo.
3. Validar el diseño de source `geotools-features` y layers `gt-*`.
4. Confirmar el contrato de interacción con:
   - unidades,
   - eventos,
   - shapes locales,
   - ORBAT.
5. Registrar decisiones técnicas clave y trade-offs en `coordination/40_decisions.log`.
6. Proponer una estrategia inicial para la línea C3IS:
   - ingestión GPX de prueba,
   - validación,
   - preparación para enlace con GPS real.

## Entregable esperado
Actualizar `coordination/10_architecture.md` con:
1. arquitectura inicial,
2. decisiones y trade-offs,
3. riesgos,
4. checklist de integración/regresión,
5. propuesta de siguiente iteración.

## Prioridad
Alta. Necesito una base técnica clara antes de consolidar instrucciones finales al Engineer.
