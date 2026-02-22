CREATE TYPE "Role" AS ENUM ('admin', 'operator', 'owner', 'guest');
CREATE TABLE "Tenant" ("id" TEXT PRIMARY KEY, "slug" TEXT UNIQUE NOT NULL, "name" TEXT NOT NULL);
CREATE TABLE "Building" ("id" TEXT PRIMARY KEY, "tenant_id" TEXT NOT NULL REFERENCES "Tenant"("id"), "slug" TEXT NOT NULL, "name" TEXT NOT NULL, UNIQUE("tenant_id","slug"));
CREATE TABLE "Gateway" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "building_id" TEXT NOT NULL REFERENCES "Building"("id"),
  "gateway_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'offline',
  "last_seen_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("tenant_id","building_id","gateway_id")
);
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "tenant_id" TEXT REFERENCES "Tenant"("id")
);
CREATE TABLE "Event" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "building_id" TEXT NOT NULL REFERENCES "Building"("id"),
  "gateway_db_id" TEXT NOT NULL REFERENCES "Gateway"("id"),
  "event_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "ts" TIMESTAMP NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("gateway_db_id","event_id")
);
CREATE INDEX "Event_tenant_id_building_id_channel_idx" ON "Event"("tenant_id","building_id","channel");
CREATE TABLE "DeviceState" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "building_id" TEXT NOT NULL REFERENCES "Building"("id"),
  "gateway_db_id" TEXT NOT NULL REFERENCES "Gateway"("id"),
  "key" TEXT NOT NULL,
  "ts" TIMESTAMP NOT NULL,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("gateway_db_id","key")
);
CREATE TABLE "ProvisioningToken" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "Tenant"("id"),
  "building_id" TEXT NOT NULL REFERENCES "Building"("id"),
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "used_at" TIMESTAMP
);
CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "actor_user_id" TEXT REFERENCES "User"("id"),
  "action" TEXT NOT NULL,
  "meta" JSONB NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
