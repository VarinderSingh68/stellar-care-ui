// Minimal JSON-file backed data store.
//
// Every collection used by the clinic backend (patients, appointments,
// treatment plans, settings, etc.) is persisted as a single JSON file on
// disk. This is intentionally simple (no database dependency) but every
// read/write is serialized through an in-process queue so concurrent
// requests can never interleave and corrupt a file, and writes are atomic
// (write to a temp file, then rename) so a crash mid-write can't leave a
// half-written file behind.
//
// NOTE: on hosting providers with an ephemeral filesystem (e.g. a Render
// "Web Service" without a persistent Disk attached), anything written here
// is lost on every deploy/restart. Set DATA_DIR to a mounted persistent
// disk path to survive restarts. See README-DEPLOY.md.

const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(filePath, defaultValue) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this._queue = Promise.resolve();
    this._ensureFile();
  }

  _ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(this.defaultValue, null, 2), 'utf8');
    }
  }

  _readSync() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw || !raw.trim()) return this._cloneDefault();
      return JSON.parse(raw);
    } catch (error) {
      console.error(`❌ Store read error (${this.filePath}):`, error.message);
      return this._cloneDefault();
    }
  }

  _cloneDefault() {
    return JSON.parse(JSON.stringify(this.defaultValue));
  }

  _writeSync(data) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = path.join(dir, `.${path.basename(this.filePath)}.tmp-${process.pid}-${Date.now()}`);
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  // Runs `fn` after every previously queued operation on this store has
  // settled, so reads/writes never race each other.
  _enqueue(fn) {
    const run = this._queue.then(fn, fn);
    this._queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  read() {
    return this._enqueue(() => this._readSync());
  }

  write(data) {
    return this._enqueue(() => {
      this._writeSync(data);
      return data;
    });
  }

  // Read-modify-write helper: `mutator` receives the current value and
  // returns the next value, all inside the same queued turn so no other
  // request can read a stale value in between.
  update(mutator) {
    return this._enqueue(() => {
      const current = this._readSync();
      const next = mutator(current);
      this._writeSync(next);
      return next;
    });
  }
}

module.exports = { JsonStore };
