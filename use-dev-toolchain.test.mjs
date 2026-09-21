import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const helper = join(directory, 'use-dev-toolchain.sh');

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'dev-node-test-'));
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
  return spawnSync('bash', ['-ec', 'source "$1"; use_dev_toolchain', 'test', helper], {
    env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 5000,
  });
}

test('dev-only absolute toolchain handles spaces and avoids NVM', () => fixture(({ bin }) => {
  const result = invoke({ DEV_NODE_BIN: bin, NVM_PATH: '/missing/nvm.sh' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'selected-node\nselected-npm\n');
}));

test('unset override retains existing NVM selection', () => fixture(({ nvm }) => {
  const result = invoke({ NVM_PATH: nvm });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'nvm-use 22\nfallback-node\nfallback-npm\n');
}));

test('invalid override fails closed instead of selecting another runtime', () => fixture(({ root, nvm }) => {
  for (const invalid of ['relative/bin', join(root, 'absent')]) {
    const result = invoke({ DEV_NODE_BIN: invalid, NVM_PATH: nvm });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid DEV_NODE_BIN/);
    assert.equal(result.stdout, '');
  }
}));

test('dev scripts use clean locks and backend pins its interpreter', () => {
  for (const name of ['deploy-frontend-dev.sh', 'deploy-backend-dev.sh']) {
    const source = readFileSync(join(directory, name), 'utf8');
    assert.match(source, /use_dev_toolchain/);
    assert.match(source, /^npm ci$/m);
    assert.doesNotMatch(source, /^npm install$/m);
  }
  assert.match(readFileSync(join(directory, 'deploy-backend-dev.sh'), 'utf8'), /restart_args\+=\(--interpreter "\$DEV_NODE_BIN\/node"\)/);
  for (const name of ['deploy-frontend-prod.sh', 'deploy-backend-prod.sh']) {
    assert.doesNotMatch(readFileSync(join(directory, name), 'utf8'), /DEV_NODE_BIN|use_dev_toolchain/);
  }
});

test('backend deployment propagates the custom interpreter through an inherited PM2 path', () => fixture(({ root, bin }) => {
  const scripts = join(root, 'scripts');
  const backend = join(root, 'backend');
  const inheritedBin = join(root, 'inherited-bin');
  for (const path of [scripts, backend, inheritedBin]) mkdirSync(path);
  for (const name of ['deploy-backend-dev.sh', 'use-dev-toolchain.sh']) {
    writeFileSync(join(scripts, name), readFileSync(join(directory, name)));
  }
  writeFileSync(join(scripts, '.env'), `DEV_NODE_BIN="${bin}"\nBACKEND_DEV_PATH="${backend}"\nBACKEND_DEV_PM2_NAME=fixture-backend\nPORT=9876\n`);
  writeFileSync(join(scripts, 'post-deploy-check.sh'), 'post_deploy_check() { echo boot-checked; }\n');
  const log = join(root, 'commands.log');
  const stub = name => `#!/bin/bash\nprintf '%s\\n' "${name}:$*" >> "$DEV_TEST_LOG"\n`;
  writeFileSync(join(bin, 'npm'), stub('npm'), { mode: 0o700 });
  writeFileSync(join(inheritedBin, 'git'), stub('git'), { mode: 0o700 });
  writeFileSync(join(inheritedBin, 'pm2'), `${stub('pm2')}test -z "\${PORT:-}"\n`, { mode: 0o700 });
  const result = spawnSync('bash', [join(scripts, 'deploy-backend-dev.sh')], {
    env: { PATH: `${inheritedBin}:${process.env.PATH}`, DEV_TEST_LOG: log }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  const commands = readFileSync(log, 'utf8');
  assert.match(commands, /^npm:ci$/m);
  assert.match(commands, /^npm:run build --if-present$/m);
  assert(commands.includes(`pm2:restart fixture-backend --update-env --interpreter ${bin}/node`));
  assert.match(result.stdout, /boot-checked/);
}));
