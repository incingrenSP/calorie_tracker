const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fittrack.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    initSchema();
    saveDb();
  }

  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      height REAL NOT NULL,
      initial_weight REAL NOT NULL,
      neck REAL DEFAULT 0,
      waist REAL DEFAULT 0,
      age INTEGER,
      gender TEXT DEFAULT 'male',
      target_calories INTEGER DEFAULT 2000,
      created_at TEXT DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      consumed REAL DEFAULT 0,
      burned REAL DEFAULT 0,
      target REAL DEFAULT 2000,
      weight REAL
    );

    CREATE TABLE IF NOT EXISTS weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS food (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      calories_per_unit REAL NOT NULL,
      unit_label TEXT DEFAULT 'serving',
      category TEXT NOT NULL CHECK(category IN ('breakfast','lunch','snack','dinner'))
    );

    CREATE TABLE IF NOT EXISTS daily_intake_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      food_id INTEGER NOT NULL,
      quantity REAL DEFAULT 1,
      meal_category TEXT DEFAULT 'breakfast',
      FOREIGN KEY(food_id) REFERENCES food(id)
    );

    CREATE TABLE workout (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('duration','reps')),
      calories_per_minute REAL DEFAULT 0,
      calories_per_rep REAL DEFAULT 0,
      category TEXT DEFAULT 'general'
    );

    CREATE TABLE workout_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      workout_id INTEGER NOT NULL,
      value REAL NOT NULL,
      calories_burned REAL NOT NULL,
      FOREIGN KEY(workout_id) REFERENCES workout(id)
    );
  `);

  // Seed food data
  const foods = [
    ['Black Instant Coffee',             5,    'cup',          'breakfast'],
    ['Egg (Boiled)',                      78,   'egg',          'breakfast'],
    ['Egg (Omelette)',                    90,   'egg',          'breakfast'],
    ['Rice (cooked)',                     206,  'cup',          'lunch'],
    ['Cauliflower Curry (Aloo Gobi)',     150,  'cup',          'lunch'],
    ['Chicken Gravy (Pressure Cooked)',   280,  'cup',          'lunch'],
    ['Biscuits (1 packet)',               1000, 'packet',       'snack'],
    ['Paneer Curry (Aloo Paneer)',        320,  'cup',          'dinner'],
    ['Chicken Biryani',                  290,  '200g serving', 'dinner'],
  ];

  const foodStmt = db.prepare(`INSERT INTO food (name, calories_per_unit, unit_label, category) VALUES (?,?,?,?)`);
  foods.forEach(f => foodStmt.run(f));
  foodStmt.free();

  // Seed workout data
  const workouts = [
    ['Cycling',           'duration', 8.0,  0,    'cardio'],
    ['Jump Rope',         'duration', 12.0, 0,    'cardio'],
    ['Plank',             'duration', 3.5,  0,    'cardio'],
    ['Push Ups',          'reps',     0,    0.5,  'push'],
    ['Tricep Dips',       'reps',     0,    0.6,  'push'],
    ['Pike Press',        'reps',     0,    0.55, 'push'],
    ['Pull Ups',          'reps',     0,    1.0,  'pull'],
    ['Bicep Curls',       'reps',     0,    0.35, 'pull'],
    ['Crunches',          'reps',     0,    0.25, 'pull'],
    ['Squats',            'reps',     0,    0.4,  'leg'],
    ['Calf Raises',       'reps',     0,    0.15, 'leg'],
    ['Leg Raises',        'reps',     0,    0.4,  'leg'],
    ['Sissy Squats',      'reps',     0,    0.5,  'leg'],
    ['Romanian Deadlift', 'reps',     0,    0.7,  'leg'],
  ];

  const wStmt = db.prepare(`INSERT INTO workout (name, type, calories_per_minute, calories_per_rep, category) VALUES (?,?,?,?,?)`);
  workouts.forEach(w => wStmt.run(w));
  wStmt.free();
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

module.exports = { getDb, query, run, get, saveDb };
