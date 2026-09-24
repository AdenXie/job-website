import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLocations } from './locations.mjs';

test('merges city aliases and associates each city with its province', () => {
  assert.deepEqual(normalizeLocations(['合肥', '合肥市', '广东佛山/广州']), {
    cities: ['合肥', '佛山', '广州'],
    provinces: ['安徽', '广东'],
    locations: [
      { city: '合肥', province: '安徽' },
      { city: '佛山', province: '广东' },
      { city: '广州', province: '广东' },
    ],
  });
});

test('handles municipalities, province-only locations and overseas values', () => {
  assert.deepEqual(normalizeLocations(['北京市顺义区', '河北省', '海外']), {
    cities: ['北京', '河北', '海外'],
    provinces: ['北京', '河北'],
    locations: [
      { city: '北京', province: '北京' },
      { city: '河北', province: '河北' },
      { city: '海外', province: null },
    ],
  });
});

test('uses one city label for Hong Kong aliases', () => {
  assert.deepEqual(normalizeLocations(['香港', '中国香港']).cities, ['香港']);
});
