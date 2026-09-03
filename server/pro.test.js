/**
 * Minimal sanity tests for the Pro license system.
 * Run with: node server/pro.test.js
 * Exits non-zero on failure (used by CI).
 */

const pro = require('./pro');

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`ok: ${msg}`);
  }
}

// Generated keys must validate
for (let i = 0; i < 100; i++) {
  const key = pro.generateLicenseKey();
  if (!pro.isValidLicenseFormat(key)) {
    console.error(`FAIL: generated key did not validate: ${key}`);
    failures++;
  }
}
console.log('ok: 100 generated keys all validate');

// Invalid keys must reject
assert(!pro.isValidLicenseFormat('random-string'), 'plain string rejected');
assert(!pro.isValidLicenseFormat('PODW-PRO-AAAAA-BBBBB-CCCCC-WRONG'), 'bad checksum rejected');
assert(!pro.isValidLicenseFormat(''), 'empty string rejected');
assert(!pro.isValidLicenseFormat(null), 'null rejected');
assert(!pro.isValidLicenseFormat('PODW-PRO-AAAAA-BBBBB'), 'too few groups rejected');

// Default status is free
const status = pro.getLicenseStatus();
assert(status.tier === 'free' && status.licensed === false, 'default status is free');

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll Pro tests passed.');
