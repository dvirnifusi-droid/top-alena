import { distanceMeters } from '../src/lib/geofence.js';

function assertNear(actual: number, expected: number, tolerance: number, label: string) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error(`FAIL ${label}: got ${actual.toFixed(1)} m, expected ~${expected} m (tol ${tolerance})`);
    process.exit(1);
  }
  console.log(`PASS ${label}: ${actual.toFixed(1)} m (≈${expected} m)`);
}

// Identical points → 0
assertNear(
  distanceMeters({ lat: 31.96, lng: 34.80 }, { lat: 31.96, lng: 34.80 }),
  0, 0.001, 'identical points',
);

// Tel Aviv → Rishon LeZion ≈ 11–13 km
assertNear(
  distanceMeters({ lat: 32.0853, lng: 34.7818 }, { lat: 31.9730, lng: 34.7925 }),
  12500, 1500, 'TLV → Rishon',
);

// ~30 m N–S step at Israel latitude: 0.00027° ≈ 30 m
assertNear(
  distanceMeters({ lat: 31.96, lng: 34.80 }, { lat: 31.96027, lng: 34.80 }),
  30, 2, '~30 m N step',
);

// ~500 m E–W step at Israel latitude: 0.0053° lng ≈ 500 m (cos ~0.85)
assertNear(
  distanceMeters({ lat: 31.96, lng: 34.80 }, { lat: 31.96, lng: 34.8053 }),
  500, 25, '~500 m E step',
);

console.log('\nAll geofence assertions passed.');
