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

## Watch MQTT messages (Compose)

From `infra/compose/dev`, you can inspect edge traffic directly from the broker container:

```bash
docker compose exec mqtt sh -lc "mosquitto_sub -h localhost -p 1883 -v -t 'rentio/v1/#'"
```

In another terminal publish a command and observe `ack/...` + `evt/...` responses:

```bash
docker compose exec mqtt sh -lc "mosquitto_pub -h localhost -p 1883 -q 1 -t 'rentio/v1/windome/casagiove-01/gw/gw-0001/cmd/device/ping' -m '{\"v\":\"1\",\"id\":\"cmd-1\",\"ts\":\"2026-01-01T00:00:00.000Z\",\"src\":\"core-api\",\"tenant\":\"windome\",\"building\":\"casagiove-01\",\"gateway\":\"gw-0001\",\"data\":{}}'"
```

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


### Troubleshooting (Windows)

If PowerShell says `npm` is not recognized, Node.js is not installed (or not on PATH). Install Node.js 24 LTS from the official installer and reopen the terminal before running Docker Compose.


If a previous build failed, do not run plain `docker compose up` immediately because Compose may reuse stale images. Use `docker compose --progress plain build --no-cache` (or `docker compose up --build`) first.


If you see `no configuration file provided: not found`, you are running Compose from the wrong directory. Run commands from `infra/compose/dev` where `docker-compose.yml` exists.


If login returns `401 Unauthorized` even with default credentials, check the root `.env` values for `ADMIN_EMAIL` and `ADMIN_PASSWORD`. In local Docker development, `core-api` reads that file through Compose and seed uses those values, so they can differ from the documented defaults.

If `docker compose exec core-api sh -lc "echo $ADMIN_EMAIL && echo $ADMIN_PASSWORD"` prints empty lines in **PowerShell**, it is usually shell interpolation on the host side. Use single quotes so variables are expanded inside the container instead:

```powershell
docker compose exec core-api sh -lc 'echo "$ADMIN_EMAIL" && echo "$ADMIN_PASSWORD"'
```

You can also verify with:

```powershell
docker compose exec core-api sh -lc 'env | grep ^ADMIN_'
```

If values are still missing, confirm `../../../.env` exists and then recreate containers so env and seed are reapplied:

```powershell
docker compose down -v --remove-orphans
docker compose up --build
```
