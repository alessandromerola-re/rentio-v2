'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveConfig, buildBaseTopic, topicFor } = require('../lib');

test('resolveConfig prefers RENTIO_* over EDGE_RENTIO_* and supports fallback', () => {
  const cfgPreferred = resolveConfig({
    RENTIO_TENANT: 'tenant-a',
    EDGE_RENTIO_TENANT: 'tenant-b',
    RENTIO_BUILDING: 'building-a',
    EDGE_RENTIO_BUILDING: 'building-b',
    RENTIO_GATEWAY: 'gw-a',
    EDGE_RENTIO_GATEWAY: 'gw-b'
  });

  assert.equal(cfgPreferred.tenant, 'tenant-a');
  assert.equal(cfgPreferred.building, 'building-a');
  assert.equal(cfgPreferred.gateway, 'gw-a');

  const cfgFallback = resolveConfig({
    EDGE_RENTIO_TENANT: 'tenant-edge',
    EDGE_RENTIO_BUILDING: 'building-edge',
    EDGE_RENTIO_GATEWAY: 'gw-edge'
  });

  assert.equal(cfgFallback.tenant, 'tenant-edge');
  assert.equal(cfgFallback.building, 'building-edge');
  assert.equal(cfgFallback.gateway, 'gw-edge');
});

test('topic builders generate v1 sys/status topic', () => {
  const base = buildBaseTopic({ tenant: 'windome', building: 'casagiove-01', gateway: 'gw-0001' });
  assert.equal(base, 'rentio/v1/windome/casagiove-01/gw/gw-0001');
  assert.equal(topicFor(base, 'sys/status'), 'rentio/v1/windome/casagiove-01/gw/gw-0001/sys/status');
});
