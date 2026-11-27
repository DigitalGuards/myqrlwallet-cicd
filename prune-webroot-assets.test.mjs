import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const script = join(directory, 'prune-webroot-assets.sh');
const DAY = 24 * 60 * 60;

function write(path, daysOld = 0) {
  writeFileSync(path, 'x');
  const time = Date.now() / 1000 - daysOld * DAY;
  utimesSync(path, time, time);
}

function fixture(run, buildFiles = 12) {
  const root = mkdtempSync(join(tmpdir(), 'prune test '));
  try {
    const dist = join(root, 'dist');
    const webroot = join(root, 'web root');
    for (const base of [dist, webroot]) {
      mkdirSync(join(base, 'assets', 'nested'), { recursive: true });
      write(join(base, 'index.html'));
    }
    // The new build, already copied over the webroot. One of its files was unchanged for a long time.
    for (let i = 0; i < buildFiles; i++) {
      write(join(dist, 'assets', `current-${i}.js`));
      write(join(webroot, 'assets', `current-${i}.js`), i === 0 ? 400 : 0);
    }
    write(join(webroot, 'assets', 'old-90.js'), 90);
    write(join(webroot, 'assets', 'nested', 'old-45.css'), 45);
    write(join(webroot, 'assets', 'recent-10.js'), 10);
    write(join(webroot, 'old-top-level.png'), 400);
    run({ root, dist, webroot });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function prune(...args) {
  return spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, PRUNE_SUDO: '' } });
}

test('removes only old asset files that the new build does not contain', () => {
  fixture(({ dist, webroot }) => {
    const result = prune(dist, webroot);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /removed 2 files older than 30 days/);
    assert.equal(existsSync(join(webroot, 'assets', 'old-90.js')), false);
    assert.equal(existsSync(join(webroot, 'assets', 'nested', 'old-45.css')), false);
    // A recent earlier build stays for tabs that are still open on it.
    assert.equal(existsSync(join(webroot, 'assets', 'recent-10.js')), true);
    // A file of the new build stays however old its timestamp is.
    assert.equal(existsSync(join(webroot, 'assets', 'current-0.js')), true);
    // Nothing outside assets is touched.
    assert.equal(existsSync(join(webroot, 'old-top-level.png')), true);
    assert.equal(existsSync(join(webroot, 'index.html')), true);
  });
});

test('takes the number of days as its third argument', () => {
  fixture(({ dist, webroot }) => {
    const result = prune(dist, webroot, '60');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(webroot, 'assets', 'old-90.js')), false);
    assert.equal(existsSync(join(webroot, 'assets', 'nested', 'old-45.css')), true);
  });
});

test('refuses a window shorter than a week and a value that is no number', () => {
  fixture(({ dist, webroot }) => {
    for (const days of ['3', '0', 'all', '-1', '']) {
      const result = prune(dist, webroot, days);
      assert.equal(result.status, 2, `days=${days}`);
    }
    assert.equal(existsSync(join(webroot, 'assets', 'old-90.js')), true);
  });
});

test('refuses a folder that is no build or no webroot of the app', () => {
  fixture(({ root, dist, webroot }) => {
    const empty = join(root, 'empty');
    mkdirSync(empty);
    assert.equal(prune(empty, webroot).status, 2);
    assert.equal(prune(dist, empty).status, 2);
    assert.equal(prune(dist, dist).status, 2);
    assert.equal(prune(dist).status, 2);
    assert.equal(existsSync(join(webroot, 'assets', 'old-90.js')), true);
  });
});

test('removes nothing when the build has almost no assets', () => {
  fixture(({ dist, webroot }) => {
    const result = prune(dist, webroot);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /only 3 asset files/);
    assert.equal(existsSync(join(webroot, 'assets', 'old-90.js')), true);
  }, 3);
});

test('does not follow a link out of the assets folder', () => {
  fixture(({ root, dist, webroot }) => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    write(join(outside, 'keep.txt'), 400);
    symlinkSync(outside, join(webroot, 'assets', 'link'));
    const result = prune(dist, webroot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(outside, 'keep.txt')), true);
  });
});
