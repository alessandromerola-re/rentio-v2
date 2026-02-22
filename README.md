# Rentio v2 MVP

Rentio v2 is a **multi-tenant, security-first, offline-first** platform with:
- **Core** control plane (`rentio-core/api`, `rentio-core/ui`)
- **Edge** data plane (`rentio-edge/agent`)

## Quickstart

```bash
cp .env.example .env
cd infra/compose/dev
docker compose up --build
```

## Services

- UI: http://localhost:3000
- API: http://localhost:3001
- Postgres: localhost:5432
- MQTT broker: localhost:1883

## Default login

- email: `admin@rentio.local`
- password: `admin12345`

(Override with `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`.)

## MQTT contract v1

Base topic:

`rentio/v1/{tenant}/{building}/gw/{gateway}/...`

Channels used:
- `cmd` Core -> Gateway
- `ack`, `evt`, `state`, `tele`, `sys` Gateway -> Core

The edge agent sends retained `sys/status=online` on connect and LWT retained `offline` on abrupt disconnect. `sys/status` is intentionally a plain string payload (`online`/`offline`), while other channels use JSON envelope.

## Publish an example event manually

```bash
mosquitto_pub -h localhost -p 1883 \
  -t 'rentio/v1/windome/casagiove-01/gw/gw-0001/evt/access/opened' \
  -q 1 \
  -m '{"v":"1","id":"evt-1","ts":"2026-01-01T00:00:00.000Z","src":"edge-agent","tenant":"windome","building":"casagiove-01","gateway":"gw-0001","data":{"door":"A1"}}'
```

## Notes

- Edge store-and-forward queue persists at `/data/outbox.jsonl` inside `edge-agent` volume.
- Provisioning token endpoint returns plaintext token once; Core stores only SHA-256 hash.
- Dev mode allows auto-registration of unknown gateways (TODO in code: disable for production).
