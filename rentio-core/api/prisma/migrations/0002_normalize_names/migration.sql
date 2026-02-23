ALTER TABLE "User" RENAME TO users;
ALTER TABLE "Tenant" RENAME TO tenants;
ALTER TABLE "Building" RENAME TO buildings;
ALTER TABLE "Gateway" RENAME TO gateways;
ALTER TABLE "Event" RENAME TO events;
ALTER TABLE "DeviceState" RENAME TO device_states;
ALTER TABLE "ProvisioningToken" RENAME TO provisioning_tokens;
ALTER TABLE "AuditLog" RENAME TO audit_logs;

ALTER INDEX IF EXISTS "Event_tenant_id_building_id_channel_idx" RENAME TO events_tenant_id_building_id_channel_idx;

ALTER INDEX IF EXISTS "User_email_key" RENAME TO users_email_key;
ALTER INDEX IF EXISTS "Tenant_slug_key" RENAME TO tenants_slug_key;
ALTER INDEX IF EXISTS "Building_tenant_id_slug_key" RENAME TO buildings_tenant_id_slug_key;
ALTER INDEX IF EXISTS "Gateway_tenant_id_building_id_gateway_id_key" RENAME TO gateways_tenant_id_building_id_gateway_id_key;
ALTER INDEX IF EXISTS "Event_gateway_db_id_event_id_key" RENAME TO events_gateway_db_id_event_id_key;
ALTER INDEX IF EXISTS "DeviceState_gateway_db_id_key_key" RENAME TO device_states_gateway_db_id_key_key;
