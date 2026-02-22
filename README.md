# Rentio v2 MVP

Core (control-plane) + Edge (data-plane) multi-tenant, offline-first, security-first.

## Quickstart

```bash
cp .env.example .env
cd infra/compose/dev
docker compose up --build
```

## URLs (host)
- UI: http://localhost:18080
- API: http://localhost:18081

## Default credentials
- email: `admin@rentio.local`
- password: `admin12345`

## MQTT Contract v1
Base topic:
`rentio/v1/{tenant}/{building}/gw/{gateway}/...`

Channels:
- cmd (Core -> Gateway)
- ack/evt/state/tele/sys (Gateway -> Core)

Envelope fields (standardized): `v,id,ts,src,tenant,building,gateway,data,corr?`

## Example publish commands

### evt
```bash
mosquitto_pub -h localhost -p 18883 -q 1 \
  -t 'rentio/v1/windome/casagiove-01/gw/gw-0001/evt/access/opened' \
  -m '{"v":"1","id":"evt-1","ts":"2026-01-01T00:00:00.000Z","src":"edge-agent","tenant":"windome","building":"casagiove-01","gateway":"gw-0001","data":{"door":"A1"}}'
```

### state (retained)
```bash
mosquitto_pub -h localhost -p 18883 -q 1 -r \
  -t 'rentio/v1/windome/casagiove-01/gw/gw-0001/state/device/relay-luce-1' \
  -m '{"v":"1","id":"state-1","ts":"2026-01-01T00:00:00.000Z","src":"edge-agent","tenant":"windome","building":"casagiove-01","gateway":"gw-0001","data":{"on":true}}'
```

### sys/status (retained + LWT style payload)
```bash
mosquitto_pub -h localhost -p 18883 -q 1 -r \
  -t 'rentio/v1/windome/casagiove-01/gw/gw-0001/sys/status' \
  -m '{"v":"1","id":"sys-1","ts":"2026-01-01T00:00:00.000Z","src":"edge-agent","tenant":"windome","building":"casagiove-01","gateway":"gw-0001","data":{"status":"online"}}'
```

## Notes / next phase
- Add reverse-proxy + TLS in front of API/UI.
- Harden auth (refresh token, password policies, MFA).
- Disable implicit gateway auto-register in production.
- Replace dev anonymous MQTT with ACL/auth.

## PR + Auto-merge workflow

- Create feature branches (`codex/<short-feature-name>`) and open PRs to `main`.
- Apply label `automerge` on the PR.
- CI workflow (`ci`) runs on `pull_request`.
- Auto-merge workflow enables `gh pr merge --auto --squash --delete-branch` when PR is labeled and ready.

Repository settings required:
1. Enable **Allow auto-merge**.
2. Protect `main` with at least one required status check (`ci`).
