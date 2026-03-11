# Outbox Director

## 2026-03-09 - Inicialización y reorientación de blackboard
- Se revisó `coordination/` existente y se reutilizó el sistema blackboard sin recrearlo desde cero.
- Se actualizó el brief para reflejar el foco actual: GeoTools tácticas en la plataforma ORBAT geoespacial.
- Se actualizó el backlog con prioridades P0/P1/P2 para GeoTools y línea C3IS GPX/GPS.
- Se enviaron nuevas instrucciones al Architect para diseñar la arquitectura inicial de integración.
- Se enviaron instrucciones al Engineer para preparar la implementación sin forzar rediseños.
- Se enviaron instrucciones al Tester para preparar validación funcional y de regresión.

## Alcance activo
- GeoTools sobre MapLibre con source/layers `gt-*` independientes.
- Integración con unidades, eventos, ORBAT y shapes existentes cuando aplique.
- Línea C3IS:
  - obtener datos GPX de prueba,
  - validar el flujo,
  - preparar enlace posterior con GPS real.

## Decisiones de negocio aún pendientes
- Tipo de empresas de seguridad objetivo.
- Tamaño esperado del ORBAT.
- Confirmación de tracking en tiempo real.
- Sistema de mapas definitivo.
- Integración con sensores o drones.

## 2026-03-09 - Verificación de implementación GeoTools
- Se verificó el estado real del frontend.
- Confirmado: ya existe una base parcial de GeoTools implementada con converter, rings, bearing, panel lateral, source `geotools-features` y export básico.
- Confirmado: el bloque táctico sigue pendiente.
- Se actualizó `coordination/20_tasks.md` para reflejar como prioridad efectiva:
  - `Sector`,
  - `Proximity Query`,
  - `Unit Dispersion`,
  - HUD/popup/layers faltantes,
  - línea C3IS GPX/GPS.
- Se actualizaron las instrucciones al Engineer para extender la base actual sin rehacerla.
- Se actualizaron las instrucciones al Tester para validar lo existente y preparar cobertura específica del bloque táctico pendiente.
