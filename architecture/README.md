# Arquitectura ORBAT (Mermaid)

## Estructura
- `00-global/01-system-overview.mmd`: vista global del sistema.
- `00-global/02-runtime-flow.mmd`: flujo operacional principal.
- `10-backend/01-bounded-contexts.mmd`: límites y dependencias backend.
- `20-engines/01-orbat-engine.mmd`: arquitectura interna ORBAT Engine.
- `20-engines/02-deployment-zone-engine.mmd`: generación de zona de despliegue.
- `20-engines/03-tracking-engine.mmd`: pipeline de tracking y anti-jitter.
- `20-engines/04-event-geolayer-engine.mmd`: transformación de eventos a capa geoespacial.
- `20-engines/05-geocoding-engine.mmd`: resiliencia y fallback Nominatim.
- `30-frontend/01-frontend-modules.mmd`: módulos UI y contratos.
- `40-data/01-data-stores.mmd`: almacenamiento, cachés y proyecciones.

## Convención
- `01`, `02`, ... orden de lectura recomendado.
- Diagramas `.mmd` para render en Mermaid.
