# Rentio v2 Overview

## Core (control plane)
- Fastify API with JWT auth, RBAC and provisioning APIs.
- Prisma + Postgres for tenants, buildings, gateways, events, device states, provisioning tokens and audit logs.
- MQTT ingestion worker embedded in API process.

## Edge (data plane)
- MQTT client that consumes `cmd/#` and publishes `ack/evt/state/tele/sys` envelopes.
- Presence via retained `sys/status` + LWT `offline`.
- Offline-first store-and-forward queue on disk (`/data/outbox.jsonl`).

## UI
- Minimal Admin Console (React/Vite): login, gateways, events, provisioning.

## Local dev stack
- Postgres 18.2
- Mosquitto 2.0.18 with persistence
- Core API
- Core UI
- Edge Agent
