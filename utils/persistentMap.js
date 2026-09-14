const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// SQLite is the source of truth. The JSON files remain useful as a migration
// source for the old version, while backups are plain JSON so they are easy to
// inspect and restore on Railway.
const configuredDataDir = process.env.BOT_DATA_DIR || process.env.DATA_DIR;
const dataDir = configuredDataDir
  ? (path.isAbsolute(configuredDataDir)
    ? configuredDataDir
    : path.join(process.cwd(), configuredDataDir))
  : path.join(__dirname, '..', 'data');
const databasePath = path.join(dataDir, 'bot.sqlite3');
const backupDir = path.join(dataDir, 'backups');
const maxBackups = 4;
const schemaVersion = 1;

let db = null;
let initialized = false;
let hydrating = false;
const maps = new Map();

function ensureDirectories() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
}

function readLegacyMap(fileName) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (error) {
    console.error(`تعذر قراءة ملف الحفظ القديم ${fileName}:`, error.message);
    return [];
  }
}

function stateFromMaps() {
  return Object.fromEntries(
    [...maps.entries()].map(([name, map]) => [name, [...map.entries()]])
  );
}

function configureDatabase(connection) {
  connection.pragma('journal_mode = WAL');
  connection.pragma('busy_timeout = 30000');
  connection.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema_version INTEGER NOT NULL,
      data_json TEXT NOT NULL
    )
  `);
}

function writeState(state) {
  if (!db) return;
  const encoded = JSON.stringify(state);
  db.prepare(`
    INSERT INTO app_state (id, schema_version, data_json)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      schema_version = excluded.schema_version,
      data_json = excluded.data_json
  `).run(schemaVersion, encoded);
}

function readState() {
  if (!db) return {};
  const row = db.prepare('SELECT data_json FROM app_state WHERE id = 1').get();
  if (!row) return {};
  const state = JSON.parse(row.data_json);
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('صيغة حالة SQLite غير صالحة');
  }
  return state;
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter(name => name.startsWith('state_') && name.endsWith('.json'))
    .sort()
    .reverse()
    .map(name => path.join(backupDir, name));
}

function restoreFromBackups() {
  for (const backupPath of listBackups()) {
    try {
      const payload = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      const state = payload?.state && typeof payload.state === 'object'
        ? payload.state
        : payload;
      if (state && typeof state === 'object' && !Array.isArray(state)) {
        console.log(`♻️ تم استرجاع البيانات من النسخة: ${path.basename(backupPath)}`);
        return state;
      }
    } catch (error) {
      console.error(`تجاهل نسخة احتياطية تالفة ${path.basename(backupPath)}:`, error.message);
    }
  }
  return null;
}

function openFreshDatabase(state) {
  if (fs.existsSync(databasePath)) {
    const corruptPath = `${databasePath}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(databasePath, corruptPath);
      console.error(`⚠️ تم عزل قاعدة SQLite التالفة إلى ${corruptPath}`);
    } catch (error) {
      console.error('تعذر عزل قاعدة SQLite التالفة:', error.message);
    }
  }
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${databasePath}${suffix}`;
    if (!fs.existsSync(sidecarPath)) continue;
    try {
      fs.renameSync(sidecarPath, `${sidecarPath}.corrupt-${Date.now()}`);
    } catch (error) {
      console.error(`تعذر عزل ملف SQLite الجانبي ${suffix}:`, error.message);
    }
  }
  db = new Database(databasePath);
  configureDatabase(db);
  writeState(state);
}

class PersistentMap extends Map {
  constructor(fileName, entries) {
    // Do not pass entries to Map's constructor: it calls the overridden
    // set() before filePath exists, which would trigger a premature save.
    super();
    this.fileName = fileName;
    this.filePath = path.join(dataDir, fileName);
    for (const [key, value] of entries || []) Map.prototype.set.call(this, key, value);
    maps.set(fileName, this);
  }

  static load(fileName) {
    return new PersistentMap(fileName, readLegacyMap(fileName));
  }

  static async initialize() {
    ensureDirectories();
    let state;

    try {
      db = new Database(databasePath);
      configureDatabase(db);
      state = readState();
      if (!Object.keys(state).length) {
        // First run: migrate the old one-file-per-map format.
        state = stateFromMaps();
        writeState(state);
      }
    } catch (error) {
      console.error('⚠️ تعذر قراءة قاعدة SQLite، سنحاول آخر نسخة احتياطية:', error.message);
      try { if (db) db.close(); } catch (_) { /* already closed */ }
      db = null;
      state = restoreFromBackups() || stateFromMaps();
      openFreshDatabase(state);
    }

    initialized = true;
    hydrating = true;
    try {
      for (const [name, map] of maps) {
        const entries = Array.isArray(state?.[name]) ? state[name] : [];
        map.clear();
        for (const [key, value] of entries) Map.prototype.set.call(map, key, value);
      }
    } finally {
      hydrating = false;
    }

    await PersistentMap.backupNow('startup');
    console.log('💾 نظام الحفظ SQLite جاهز:', databasePath);
  }

  static snapshot() {
    return stateFromMaps();
  }

  static async backupNow(reason = 'scheduled') {
    if (!db) return null;
    ensureDirectories();
    const payload = {
      schemaVersion,
      reason,
      createdAt: new Date().toISOString(),
      state: readState(),
    };
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .replace(/\..+/, '');
    const backupPath = path.join(backupDir, `state_${timestamp}_${Date.now() % 1000}.json`);
    const tempPath = `${backupPath}.tmp`;

    const file = fs.openSync(tempPath, 'w');
    try {
      fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
      fs.fsyncSync(file);
    } finally {
      fs.closeSync(file);
    }
    fs.renameSync(tempPath, backupPath);

    for (const oldPath of listBackups().slice(maxBackups)) {
      try { fs.unlinkSync(oldPath); } catch (_) { /* already removed */ }
    }
    console.log(`🛟 تم حفظ نسخة احتياطية (${reason}): ${path.basename(backupPath)}`);
    return backupPath;
  }

  static async close() {
    if (db) db.close();
    db = null;
    initialized = false;
  }

  _saveLegacy() {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify([...this.entries()], null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      console.error(`تعذر تحديث ملف التوافق ${this.fileName}:`, error.message);
    }
  }

  _save() {
    this._saveLegacy();
    if (!initialized || hydrating || !db) return;
    try {
      // One transaction protects the complete bot state from partial writes.
      const save = db.transaction(() => writeState(PersistentMap.snapshot()));
      save();
    } catch (error) {
      console.error(`تعذر حفظ ${this.fileName} في SQLite:`, error.message);
    }
  }

  set(key, value) {
    super.set(key, value);
    this._save();
    return this;
  }

  delete(key) {
    const result = super.delete(key);
    this._save();
    return result;
  }
}

module.exports = PersistentMap;
module.exports.DATA_DIR_PATH = dataDir;
module.exports.DATABASE_PATH = databasePath;
module.exports.BACKUP_DIR_PATH = backupDir;
module.exports.MAX_BACKUPS = maxBackups;