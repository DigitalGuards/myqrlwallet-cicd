import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const script = join(directory, 'prune-webroot-assets.sh');
const DAY = 24 * 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

function write(path, daysOld = 0) {
  writeFileSync(path, 'x');
  const time = nowSeconds() - daysOld * DAY;
  utimesSync(path, time, time);
}

function fixture(run, buildFiles = 12) {
  const root = mkdtempSync(join(tmpdir(), 'prune test '));
  try {
    const dist = join(root, 'dist');
    const webroot = join(root, 'web root');
    const state = join(root, 'state');
    for (const base of [dist, webroot]) {
      mkdirSync(join(base, 'assets', 'nested'), { recursive: true });
      write(join(base, 'index.html'));
    }
    // The new build, already copied over the webroot. One of its files kept an old timestamp.
    for (let i = 0; i < buildFiles; i++) {
      write(join(dist, 'assets', `current-${i}.js`));
      write(join(webroot, 'assets', `current-${i}.js`), i === 0 ? 400 : 0);
    }
    write(join(webroot, 'old-top-level.png'), 400);
    const asset = (name) => join(webroot, 'assets', name);
    /** Records an earlier deploy: its file list, and its files in the webroot with that age. */
    const earlierDeploy = (daysAgo, names) => {
      const folder = join(state, createHash('sha256').update(realpathSync(webroot)).digest('hex').slice(0, 16));
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, `${nowSeconds() - daysAgo * DAY}.list`), names.map((name) => `assets/${name}\0`).join(''));
      for (const name of names) write(asset(name), daysAgo);
      return folder;
    };
    const prune = (...args) =>
      spawnSync('bash', [script, '--state', state, dist, webroot, ...args], { encoding: 'utf8' });
    run({ root, dist, webroot, state, asset, earlierDeploy, prune });
  } finally {
    spawnSync('chmod', ['-R', 'u+rwx', root]);
    rmSync(root, { recursive: true, force: true });
  }
}

test('removes old asset files that no recorded build protects', () => {
  fixture(({ webroot, asset, prune }) => {
    write(asset('old-90.js'), 90);
    write(asset(join('nested', 'old-45.css')), 45);
    write(asset('recent-10.js'), 10);
    const result = prune();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /removed 2 files/);
    assert.equal(existsSync(asset('old-90.js')), false);
    assert.equal(existsSync(asset(join('nested', 'old-45.css'))), false);
    // A file written recently stays, whatever build it came from.
    assert.equal(existsSync(asset('recent-10.js')), true);
    // A file of the new build stays however old its timestamp is.
    assert.equal(existsSync(asset('current-0.js')), true);
    // Nothing outside assets is touched.
    assert.equal(existsSync(join(webroot, 'old-top-level.png')), true);
    assert.equal(existsSync(join(webroot, 'index.html')), true);
  });
});

test('keeps the build before this one, however long ago it was deployed', () => {
  fixture(({ asset, earlierDeploy, prune }) => {
    earlierDeploy(40, ['previous-a.js', 'previous-b.css']);
    const result = prune();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /removed 0 files/);
    assert.equal(existsSync(asset('previous-a.js')), true);
    assert.equal(existsSync(asset('previous-b.css')), true);
  });
});

test('removes a build once the deploy that replaced it is older than the window', () => {
  fixture(({ asset, earlierDeploy, prune }) => {
    const folder = earlierDeploy(80, ['first.js', 'shared.js']);
    earlierDeploy(40, ['second.js', 'shared.js']);
    const result = prune();
    assert.equal(result.status, 0, result.stderr);
    // The first build was replaced 40 days ago; the second one just now.
    assert.equal(existsSync(asset('first.js')), false);
    assert.equal(existsSync(asset('second.js')), true);
    assert.equal(existsSync(asset('shared.js')), true);
    // The list that can no longer protect a file is gone; the previous and the new one stay.
    assert.equal(readdirSync(folder).length, 2);
  });
});

test('keeps a build that was replaced inside the window', () => {
  fixture(({ asset, earlierDeploy, prune }) => {
    earlierDeploy(50, ['first.js']);
    earlierDeploy(10, ['second.js']);
    const result = prune();
    assert.equal(result.status, 0, result.stderr);
    // Replaced 10 days ago: a tab opened before that deploy may still need it.
    assert.equal(existsSync(asset('first.js')), true);
    assert.equal(existsSync(asset('second.js')), true);
  });
});

test('takes the number of days as its last argument', () => {
  fixture(({ asset, prune }) => {
    write(asset('old-90.js'), 90);
    write(asset('old-45.js'), 45);
    const result = prune('60');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(asset('old-90.js')), false);
    assert.equal(existsSync(asset('old-45.js')), true);
  });
});

test('counts the window in whole days from now', () => {
  fixture(({ asset, prune }) => {
    write(asset('old-30-and-a-bit.js'), 30.5);
    write(asset('old-29-and-a-bit.js'), 29.5);
    assert.equal(prune().status, 0);
    assert.equal(existsSync(asset('old-30-and-a-bit.js')), false);
    assert.equal(existsSync(asset('old-29-and-a-bit.js')), true);
  });
});

test('refuses a window shorter than a week and a value that is no number', () => {
  fixture(({ asset, prune }) => {
    write(asset('old-90.js'), 90);
    for (const days of ['3', '0', 'all', '-1', '']) {
      assert.equal(prune(days).status, 2, `days=${days}`);
    }
    assert.equal(existsSync(asset('old-90.js')), true);
  });
});

test('refuses a folder that is no build or no webroot of the app', () => {
  fixture(({ root, dist, webroot, state, asset }) => {
    write(asset('old-90.js'), 90);
    const run = (...args) => spawnSync('bash', [script, '--state', state, ...args], { encoding: 'utf8' }).status;
    const empty = join(root, 'empty');
    mkdirSync(empty);
    assert.equal(run(empty, webroot), 2);
    assert.equal(run(dist, empty), 2);
    assert.equal(run(dist, dist), 2);
    assert.equal(run(dist), 2);
    // An assets folder that is a link is no webroot of the app.
    const linked = join(root, 'linked');
    mkdirSync(linked);
    write(join(linked, 'index.html'));
    symlinkSync(join(webroot, 'assets'), join(linked, 'assets'));
    assert.equal(run(dist, linked), 2);
    assert.equal(existsSync(asset('old-90.js')), true);
  });
});

test('removes and records nothing when the build has almost no assets', () => {
  fixture(({ state, asset, prune }) => {
    write(asset('old-90.js'), 90);
    const result = prune();
    assert.equal(result.status, 2);
    assert.match(result.stderr, /only 3 asset files/);
    assert.equal(existsSync(asset('old-90.js')), true);
    assert.equal(existsSync(state) ? readdirSync(state).flatMap((d) => readdirSync(join(state, d))).length : 0, 0);
  }, 3);
});

test('does not follow a link out of the assets folder', () => {
  fixture(({ root, asset, prune }) => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    write(join(outside, 'keep.txt'), 400);
    symlinkSync(outside, asset('link'));
    const result = prune();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(outside, 'keep.txt')), true);
  });
});

test('handles file names with a line break, a leading dash and spaces', () => {
  fixture(({ asset, prune }) => {
    const names = ['-rf', 'two\nlines.js', 'with space.js'];
    for (const name of names) write(asset(name), 90);
    const result = prune();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /removed 3 files/);
    for (const name of names) assert.equal(existsSync(asset(name)), false);
    assert.equal(existsSync(asset('current-1.js')), true);
  });
});

test('removes nothing and fails when the assets folder cannot be listed in full', { skip: process.getuid?.() === 0 }, () => {
  fixture(({ asset, prune }) => {
    write(asset('old-90.js'), 90);
    mkdirSync(asset('closed'));
    write(asset(join('closed', 'old.js')), 90);
    chmodSync(asset('closed'), 0o000);
    const result = prune();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not list/);
    assert.equal(existsSync(asset('old-90.js')), true);
  });
});
