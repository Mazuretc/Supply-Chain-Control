import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalizeSupplierOrder } from './supplier-order';

test('canonicalizes meaningful supplier-order formatting consistently', () => {
  for (const value of [' so 001 ', 'SO_001', 'so–001', 'SO/001']) {
    assert.equal(canonicalizeSupplierOrder(value), 'SO-001');
  }
});

test('rejects empty or punctuation-only supplier-order values', () => {
  assert.equal(canonicalizeSupplierOrder('---'), null);
  assert.equal(canonicalizeSupplierOrder('   '), null);
});
