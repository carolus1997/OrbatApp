# Demo Data Generator -> Director

## Estado
- Datasets demo generados y disponibles en `coordination/demo_data/`.
- Nota de coordinacion: no existe `coordination/inbox/demo_data.md` en el workspace actual; se tomo como solicitud activa el mandato recibido en este turno.

## Entregables generados
Se generaron 3 escenarios operativos coherentes con ORBAT + tracking + eventos:

1. `patrullaje_urbano`
- Equipos: 3
- Operadores: 15
- Vehiculos: 5
- Sensores: 12
- Puntos GNSS (GeoJSON): 112
- Eventos operativos: 90

2. `evento_publico`
- Equipos: 10
- Operadores: 50
- Vehiculos: 12
- Sensores: 35
- Puntos GNSS (GeoJSON): 352
- Eventos operativos: 260

3. `vigilancia_perimetral`
- Equipos: 3
- Operadores: 12
- Vehiculos: 4
- Sensores: 24 (predominio fijo)
- Puntos GNSS (GeoJSON): 126
- Eventos operativos: 120

## Estructura de archivos por escenario
En cada carpeta de escenario (`coordination/demo_data/<escenario>/`):
- `organizations.json`
- `units_orbat.json`
- `operators.json`
- `operators.csv`
- `vehicles.json`
- `sensors.json`
- `positions.geojson`
- `events.json`

Adicional:
- `coordination/demo_data/index.json` con resumen global, timestamp de generacion y formatos disponibles.

## Coherencia de modelo aplicada
- Jerarquia ORBAT: `empresa -> division -> section -> team` con `parent_id` consistente.
- Operadores con campos requeridos: `id`, `name`, `role`, `unit`, `status`, `photo`, `equipment`.
- Vehiculos con `id`, `type`, `unit_assigned`, `status`, `identifier`.
- Sensores con `type`, `unit_assigned`, `mobility` (`fixed|mobile`).
- Posiciones GNSS en GeoJSON con `timestamp`, `speed`, `heading`, `accuracy`, `source`.
- Eventos normalizados alineados a `CanonicalEvent v1` (`event_type`, `schema_version`, `source_system`, `payload.kind`, `geo`, etc.).

## Uso recomendado
- Demos visuales MapLibre: consumir `positions.geojson` + `units_orbat.json`.
- Simulacion operacional: reproducir `events.json` en orden por `occurred_at`.
- Carga inicial: usar escenario `evento_publico` por volumen (50 operadores, 260 eventos).
