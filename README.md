# Rentio v2 MVP

Core (control-plane) + Edge (data-plane) multi-tenant, offline-first, security-first.

## Quickstart

```bash
cp .env.example .env
cd infra/compose/dev
docker compose up --build
```

After `docker compose up --build`, `core-api` automatically waits for Postgres, applies Prisma migrations, and runs idempotent seed data (admin user + optional tenant/building when seed env is set).

## Manual DB bootstrap commands

From `infra/compose/dev`:

```bash
docker compose exec core-api npm run migrate:deploy
docker compose exec core-api npm run seed
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
docker compose exec mqtt mosquitto_sub -h localhost -t 'rentio/v1/#' -v
```

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

## DB table naming (normalized)

Tables are now normalized to lowercase plural names (`gateways`, `events`, `users`, `tenants`, `buildings`, `device_states`, `provisioning_tokens`, `audit_logs`).
Older SQL snippets that referenced PascalCase tables like `"Gateway"` / `"Event"` should be updated.

Useful ops queries from `infra/compose/dev`:

```bash
docker compose exec postgres psql -U rentio -d rentio -c "select gateway_id,status,last_seen_at from gateways order by last_seen_at desc limit 5;"
docker compose exec postgres psql -U rentio -d rentio -c "select channel,type,ts,topic from events order by ts desc limit 20;"
```

## Service health endpoints

- API health: `GET /health`
- UI health: `GET /api/health`

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

If `docker compose logs core-api` shows repeated `No such file or directorycute 'bash'` errors on Windows, your checkout likely converted `docker-entrypoint.sh` to CRLF. Rebuild images after pulling latest fixes (the Dockerfile now normalizes line endings during build), or set shell files to LF in Git.


If `docker compose ps` shows `core-api` as `unhealthy` and `\dt` returns no tables, inspect bootstrap logs first:

```powershell
docker compose logs -f core-api
```

You should see migration + seed steps (`applying migrations`, `seeding data`) before server start.

