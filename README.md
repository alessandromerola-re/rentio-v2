# Rentio v2 MVP

Core (control-plane) + Edge (data-plane) multi-tenant, offline-first, security-first.

## Quickstart

```bash
cd infra/compose/dev
cp .env.example .env
docker compose up --build
```

## Windows quickstart (Docker Desktop)

```powershell
cd infra/compose/dev
copy .env.example .env
docker compose up --build
docker compose ps -a
docker compose logs -f edge-agent
```

> Compose reads `.env` from the same folder as `docker-compose.yml` (`infra/compose/dev/.env`).

## URLs (host)
- UI: http://localhost:18080
- API: http://localhost:18081

Debug ports are disabled by default. Enable them only when needed:

```bash
docker compose --profile debug up -d
```

- MQTT debug bridge: `localhost:18883`
- Postgres debug bridge: `localhost:15432`

## Default credentials
- email: `admin@rentio.local`
- password: `admin12345`

## Watch MQTT messages (Compose)

From `infra/compose/dev`, you can inspect edge traffic directly from the broker container:

```bash
docker compose exec mqtt mosquitto_sub -h localhost -t 'rentio/v1/#' -v
```

`docker compose exec` is the Compose-safe equivalent of `docker exec`: it targets services by name (for example `mqtt` or `edge-agent`) without guessing container IDs/names.

In another terminal publish a command and observe `ack/...` + `evt/...` responses:

```bash
docker compose exec mqtt mosquitto_pub -h localhost -q 1 -t 'rentio/v1/windome/casagiove-01/gw/gw-0001/cmd/device/ping' -m '{"v":"1","id":"cmd-1","ts":"2026-01-01T00:00:00.000Z","src":"core-api","tenant":"windome","building":"casagiove-01","gateway":"gw-0001","data":{}}'
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
docker compose exec mqtt mosquitto_pub -h localhost -q 1 \
  -t 'rentio/v1/windome/casagiove-01/gw/gw-0001/evt/access/opened' \
  -m '{"v":"1","id":"evt-1","ts":"2026-01-01T00:00:00.000Z","src":"edge-agent","tenant":"windome","building":"casagiove-01","gateway":"gw-0001","data":{"door":"A1"}}'
```

### state (retained)
```bash
docker compose exec mqtt mosquitto_pub -h localhost -q 1 -r \
  -t 'rentio/v1/windome/casagiove-01/gw/gw-0001/state/device/relay-luce-1' \
  -m '{"v":"1","id":"state-1","ts":"2026-01-01T00:00:00.000Z","src":"edge-agent","tenant":"windome","building":"casagiove-01","gateway":"gw-0001","data":{"on":true}}'
```

### sys/status (retained + LWT style payload)
```bash
docker compose exec mqtt mosquitto_pub -h localhost -q 1 -r \
  -t 'rentio/v1/windome/casagiove-01/gw/gw-0001/sys/status' \
  -m '{"v":"1","id":"sys-1","ts":"2026-01-01T00:00:00.000Z","src":"edge-agent","tenant":"windome","building":"casagiove-01","gateway":"gw-0001","data":{"status":"online"}}'
```

## Service health endpoints

- API health: `GET /health`
- UI health: `GET /api/health` (used by Docker healthcheck, always returns `200` + `{ "ok": true }` when app is running)

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


If login returns `401 Unauthorized` even with default credentials, check `infra/compose/dev/.env` values for `ADMIN_EMAIL` and `ADMIN_PASSWORD`. In local Docker development, `core-api` reads that file through Compose and seed uses those values, so they can differ from the documented defaults.

If `docker compose exec core-api sh -lc "echo $ADMIN_EMAIL && echo $ADMIN_PASSWORD"` prints empty lines in **PowerShell**, it is usually shell interpolation on the host side. Use single quotes so variables are expanded inside the container instead:

```powershell
docker compose exec core-api sh -lc 'echo "$ADMIN_EMAIL" && echo "$ADMIN_PASSWORD"'
```

You can also verify with:

```powershell
docker compose exec core-api sh -lc 'env | grep ^ADMIN_'
```

If values are still missing, confirm `infra/compose/dev/.env` exists and then recreate containers so env and seed are reapplied:

```powershell
docker compose down -v --remove-orphans
docker compose up --build
```
