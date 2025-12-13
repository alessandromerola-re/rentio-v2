# Rentio v2

Core (centrale) + Edge (gateway) per automazione immobiliare multi-tenant.
Obiettivo: offline-first e security-first.

## Struttura
- rentio-core/api   -> Backend API
- rentio-core/ui    -> Web UI
- rentio-edge/agent -> Gateway agent
- infra/compose     -> Stack Docker/Compose
- docs/architecture -> Documentazione

## Dev stack (iniziale)
- PostgreSQL
- MQTT (Mosquitto)
