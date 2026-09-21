import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'prod-node-test-'));
  try {
    const bin = join(root, 'toolchain bin');
    mkdirSync(bin);
    for (const executable of ['node', 'npm']) {
      writeFileSync(join(bin, executable), `#!/bin/bash\necho selected-${executable}\n`, { mode: 0o700 });
    }
    const nvm = join(root, 'nvm.sh');
    writeFileSync(nvm, 'nvm() { echo "nvm-$*"; }\nnode() { echo fallback-node; }\nnpm() { echo fallback-npm; }\n');
    run({ root, bin, nvm });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function invoke(env) {
  return spawnSync('bash', ['-ec', 'source "$1"; use_prod_toolchain', 'test', join(directory, 'use-prod-toolchain.sh')], {
    env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 5000,
  });
}

test('production toolchain selects its override independently of dev', () => fixture(({ bin }) => {
  const result = invoke({ PRODUCTION_NODE_BIN: bin, DEV_NODE_BIN: '/missing/dev', NVM_PATH: '/missing/nvm' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'selected-node\nselected-npm\n');
}));

test('production without an override retains NVM selection', () => fixture(({ nvm }) => {
  const result = invoke({ NVM_PATH: nvm, DEV_NODE_BIN: '/missing/dev' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'nvm-use 22\nfallback-node\nfallback-npm\n');
}));

test('invalid production runtime fails before fallback', () => fixture(({ root, nvm }) => {
  for (const invalid of ['relative/bin', join(root, 'absent')]) {
    const result = invoke({ PRODUCTION_NODE_BIN: invalid, NVM_PATH: nvm });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid PRODUCTION_NODE_BIN/);
    assert.equal(result.stdout, '');
  }
}));

test('production backend pins its PM2 interpreter and installs its lock', () => fixture(({ root, bin }) => {
  const scripts = join(root, 'scripts');
  const backend = join(root, 'backend');
  const inheritedBin = join(root, 'inherited-bin');
  for (const path of [scripts, backend, inheritedBin]) mkdirSync(path);
  for (const name of ['deploy-backend-prod.sh', 'use-prod-toolchain.sh']) {
    writeFileSync(join(scripts, name), readFileSync(join(directory, name)));
  }
  writeFileSync(join(scripts, '.env'), `PRODUCTION_NODE_BIN="${bin}"\nBACKEND_PROD_PATH="${backend}"\nBACKEND_PROD_PM2_NAME=fixture-backend\nPORT=9876\n`);
  writeFileSync(join(scripts, 'post-deploy-check.sh'), 'post_deploy_check() { echo boot-checked; }\n');
  const log = join(root, 'commands.log');
  const stub = name => `#!/bin/bash\nprintf '%s\\n' "${name}:$*" >> "$PROD_TEST_LOG"\n`;
  writeFileSync(join(bin, 'npm'), stub('npm'), { mode: 0o700 });
  writeFileSync(join(inheritedBin, 'git'), stub('git'), { mode: 0o700 });
  writeFileSync(join(inheritedBin, 'pm2'), `${stub('pm2')}test -z "\${PORT:-}"\n`, { mode: 0o700 });
  const result = spawnSync('bash', [join(scripts, 'deploy-backend-prod.sh')], {
    env: { PATH: `${inheritedBin}:${process.env.PATH}`, PROD_TEST_LOG: log }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  const commands = readFileSync(log, 'utf8');
  assert.match(commands, /^npm:ci$/m);
  assert(commands.includes(`pm2:restart fixture-backend --update-env --interpreter ${bin}/node`));
  assert.match(result.stdout, /boot-checked/);
  assert.match(readFileSync(join(directory, 'deploy-frontend-prod.sh'), 'utf8'), /^npm ci$/m);
}));
