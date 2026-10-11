/**
 * Store — tiny JSON-file persistence layer.
 *
 * Seed files in data/seed/ are committed to git and never modified.
 * Runtime files in data/ are created from the seeds on first start,
 * are git-ignored, and can be restored at any time with resetAll().
 */
const fs = require('fs');
const path = require('path');

const SEED_DIR = path.join(__dirname, '..', 'data', 'seed');
// Tests point this at a temporary directory so real data is never touched
const DATA_DIR = process.env.SHOPMIND_DATA_DIR || path.join(__dirname, '..', 'data');

// collection name -> default value when no seed file exists
const COLLECTIONS = {
  products: [],
  customers: [],
  emi_records: [],
  abandoned_carts: [],
  orders: [],
  audit_logs: [],
  guardrails: {},
  assistant_memory: {},
};

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function seedValue(name) {
  const seedFile = path.join(SEED_DIR, `${name}.json`);
  if (fs.existsSync(seedFile)) return fs.readFileSync(seedFile, 'utf-8');
  return JSON.stringify(COLLECTIONS[name] ?? [], null, 2);
}

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf-8'));
  } catch {
    return JSON.parse(seedValue(name));
  }
}

function write(name, data) {
  // Write to a temp file and rename so a crash mid-write never corrupts data
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, target);
}

/** Create any missing runtime files from their seeds. */
function init() {
  Object.keys(COLLECTIONS).forEach(name => {
    if (!fs.existsSync(filePath(name))) {
      fs.writeFileSync(filePath(name), seedValue(name));
    }
  });
}

/** Restore one collection (or all, when no name is given) to its seed state. */
function reset(name) {
  const names = name ? [name] : Object.keys(COLLECTIONS);
  names.forEach(n => fs.writeFileSync(filePath(n), seedValue(n)));
}

module.exports = { read, write, init, reset, DATA_DIR };
