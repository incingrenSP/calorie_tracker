const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, query, run, get } = require('./backend/db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// USER ROUTES

app.get('/api/user', async (req, res) => {
  await getDb();
  const user = get('SELECT * FROM user LIMIT 1');
  res.json(user || null);
});

app.post('/api/user/setup', async (req, res) => {
  await getDb();
  const { height, weight, neck, waist, age, gender, target_calories } = req.body;
  const existing = get('SELECT id FROM user LIMIT 1');
  if (existing) return res.status(400).json({ error: 'User already set up' });

  run(
    `INSERT INTO user (height, initial_weight, neck, waist, age, gender, target_calories) VALUES (?,?,?,?,?,?,?)`,
    [height, weight, neck || 0, waist || 0, age || 25, gender || 'male', target_calories || 2000]
  );

  // Also log the initial weight
  const today = new Date().toISOString().split('T')[0];
  run(`INSERT INTO weight_logs (date, weight) VALUES (?,?)`, [today, weight]);

  res.json({ success: true });
});

app.put('/api/user', async (req, res) => {
  await getDb();
  const { height, neck, waist, age, gender, target_calories } = req.body;
  run(`UPDATE user SET height=?, neck=?, waist=?, age=?, gender=?, target_calories=? WHERE id=1`,
    [height, neck || 0, waist || 0, age, gender, target_calories]);
  res.json({ success: true });
});

// WEIGHT ROUTES

app.get('/api/weight', async (req, res) => {
  await getDb();
  const logs = query('SELECT * FROM weight_logs ORDER BY date DESC LIMIT 12');
  res.json(logs.reverse());
});

app.post('/api/weight', async (req, res) => {
  await getDb();
  const { weight, date } = req.body;
  const d = date || new Date().toISOString().split('T')[0];
  const existing = get('SELECT id FROM weight_logs WHERE date=?', [d]);
  if (existing) {
    run('UPDATE weight_logs SET weight=? WHERE date=?', [weight, d]);
  } else {
    run('INSERT INTO weight_logs (date, weight) VALUES (?,?)', [d, weight]);
  }
  res.json({ success: true });
});

// FOOD ROUTES

app.get('/api/food', async (req, res) => {
  await getDb();
  const { category } = req.query;
  if (category) {
    const foods = query('SELECT * FROM food WHERE category=? ORDER BY name', [category]);
    return res.json(foods);
  }
  const foods = query('SELECT * FROM food ORDER BY category, name');
  res.json(foods);
});

app.post('/api/food', async (req, res) => {
  await getDb();
  const { name, calories_per_unit, unit_label, category } = req.body;
  run(`INSERT INTO food (name, calories_per_unit, unit_label, category) VALUES (?,?,?,?)`,
    [name, calories_per_unit, unit_label || 'serving', category]);
  res.json({ success: true });
});

// INTAKE ROUTES

app.get('/api/intake', async (req, res) => {
  await getDb();
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const logs = query(`
    SELECT dil.*, f.name, f.calories_per_unit, f.unit_label,
           COALESCE(dil.meal_category, f.category) as category,
           (f.calories_per_unit * dil.quantity) as total_calories
    FROM daily_intake_logs dil
    JOIN food f ON f.id = dil.food_id
    WHERE dil.date=?
    ORDER BY dil.id
  `, [date]);
  res.json(logs);
});

app.post('/api/intake', async (req, res) => {
  await getDb();
  const { food_id, quantity, date, category } = req.body;
  const d = date || new Date().toISOString().split('T')[0];
  // Use category from request (which meal tab logged it), falling back to food's own category
  const food = get('SELECT category FROM food WHERE id=?', [food_id]);
  const meal_category = category || (food ? food.category : 'breakfast');
  run(`INSERT INTO daily_intake_logs (date, food_id, quantity, meal_category) VALUES (?,?,?,?)`,
    [d, food_id, quantity || 1, meal_category]);
  res.json({ success: true });
});

app.delete('/api/intake/:id', async (req, res) => {
  await getDb();
  run('DELETE FROM daily_intake_logs WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// DAILY SUMMARY

app.get('/api/summary', async (req, res) => {
  await getDb();
  const date = req.query.date || new Date().toISOString().split('T')[0];

  const caloriesIn = get(`
    SELECT COALESCE(SUM(f.calories_per_unit * dil.quantity), 0) as total
    FROM daily_intake_logs dil
    JOIN food f ON f.id = dil.food_id
    WHERE dil.date=?
  `, [date]);

  const caloriesOut = get(`
    SELECT COALESCE(SUM(wl.calories_burned), 0) as total
    FROM workout_logs wl
    WHERE wl.date=?
  `, [date]);

  const workoutLogged = get(`
    SELECT COUNT(*) as count FROM workout_logs WHERE date=?
  `, [date]);

  const user = get('SELECT * FROM user LIMIT 1');
  const latestWeight = get(`
    SELECT weight FROM weight_logs ORDER BY date DESC LIMIT 1
  `);

  let bmi = null, bodyFat = null;
  if (user && latestWeight) {
    const heightM = user.height / 100;
    bmi = (latestWeight.weight / (heightM * heightM)).toFixed(1);

    // U.S. Navy metric body fat formula (male only)
    // BFP = 495 / (1.0324 - 0.19077×log10(waist-neck) + 0.15456×log10(height)) - 450
    if (user.waist && user.neck) {
      bodyFat = (495 / (1.0324 - 0.19077 * Math.log10(user.waist - user.neck) + 0.15456 * Math.log10(user.height)) - 450).toFixed(1);
    }
  }

  const consumed = caloriesIn.total;
  const burned = caloriesOut.total;
  const target = user ? user.target_calories : 2000;
  const remaining = (target + burned) - consumed;

  res.json({
    date,
    consumed,
    burned,
    target,
    remaining,
    workout_logged: workoutLogged.count > 0,
    bmi,
    body_fat: bodyFat,
    current_weight: latestWeight ? latestWeight.weight : null,
    user
  });
});

// PAST RECORDS ROUTES

app.get('/api/past-records', async (req, res) => {
  await getDb();
  const records = query('SELECT * FROM daily_records ORDER BY date DESC LIMIT 30');
  res.json(records);
});

app.post('/api/past-records/snapshot', async (req, res) => {
  await getDb();
  const { date } = req.body;
  const d = date || new Date().toISOString().split('T')[0];

  // Check if record already exists for this date
  const existing = get('SELECT id FROM daily_records WHERE date=?', [d]);
  if (existing) return res.json({ success: true, skipped: true });

  const caloriesIn = get(`
    SELECT COALESCE(SUM(f.calories_per_unit * dil.quantity), 0) as total
    FROM daily_intake_logs dil JOIN food f ON f.id = dil.food_id WHERE dil.date=?
  `, [d]);
  const caloriesOut = get(`
    SELECT COALESCE(SUM(calories_burned), 0) as total FROM workout_logs WHERE date=?
  `, [d]);
  const user = get('SELECT * FROM user LIMIT 1');
  const latestWeight = get(`SELECT weight FROM weight_logs WHERE date <= ? ORDER BY date DESC LIMIT 1`, [d]);

  run(`INSERT INTO daily_records (date, consumed, burned, target, weight) VALUES (?,?,?,?,?)`,
    [d, caloriesIn.total, caloriesOut.total, user ? user.target_calories : 2000, latestWeight ? latestWeight.weight : null]);

  res.json({ success: true });
});

// WORKOUT ROUTES 

app.get('/api/workouts', async (req, res) => {
  await getDb();
  const workouts = query('SELECT * FROM workout ORDER BY category, name');
  res.json(workouts);
});

app.get('/api/workout-logs', async (req, res) => {
  await getDb();
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const logs = query(`
    SELECT wl.*, w.name, w.type, w.category, w.calories_per_minute, w.calories_per_rep
    FROM workout_logs wl
    JOIN workout w ON w.id = wl.workout_id
    WHERE wl.date=?
    ORDER BY wl.id DESC
  `, [date]);
  res.json(logs);
});

app.post('/api/workout-logs', async (req, res) => {
  await getDb();
  const { workout_id, value, date } = req.body;
  const d = date || new Date().toISOString().split('T')[0];

  const workout = get('SELECT * FROM workout WHERE id=?', [workout_id]);
  if (!workout) return res.status(404).json({ error: 'Workout not found' });

  let calories_burned = 0;
  if (workout.type === 'duration') {
    calories_burned = workout.calories_per_minute * value;
  } else {
    calories_burned = workout.calories_per_rep * value;
  }

  run(`INSERT INTO workout_logs (date, workout_id, value, calories_burned) VALUES (?,?,?,?)`,
    [d, workout_id, value, calories_burned]);
  res.json({ success: true, calories_burned });
});

app.delete('/api/workout-logs/:id', async (req, res) => {
  await getDb();
  run('DELETE FROM workout_logs WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// SERVE FRONTEND

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// START

const PORT = process.env.PORT || 8000;
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  CalorieTracker running at http://localhost:${PORT}\n`);
  });
});
