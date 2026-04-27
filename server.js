const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, query, run, get } = require('./backend/db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ─── DAY TYPE HELPER ────────────────────────────────────────────────────────────
// Week from Sunday: push > pull > leg > push > pull > leg > rest
const DAY_TYPES = ['push', 'pull', 'leg', 'push', 'pull', 'leg', 'rest'];
function getDayType(dateObj) {
  return DAY_TYPES[dateObj.getDay()];
}

// ─── BODY FAT HELPERS (U.S. Navy Method, metric) ────────────────────────────────
// Male:   BFP = 495 / (1.0324 - 0.19077×log10(waist-neck) + 0.15456×log10(height)) - 450
// Female: BFP = 495 / (1.29579 - 0.35004×log10(waist+hip-neck) + 0.22100×log10(height)) - 450
// Falls back to BMI method if neck/waist/hip not set
// BMI male:   BFP = 1.20×BMI + 0.23×Age - 16.2
// BMI female: BFP = 1.20×BMI + 0.23×Age - 5.4
function calcBodyFat(user, weightKg) {
  const heightCm = user.height;
  const age = user.age || 25;
  const gender = user.gender || 'male';

  // Try Navy method first if measurements exist
  if (user.waist > 0 && user.neck > 0) {
    if (gender === 'male') {
      const diff = user.waist - user.neck;
      if (diff > 0) {
        const bfp = (495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm))) - 450;
        return Math.max(0, bfp).toFixed(1);
      }
    } else {
      if (user.hip > 0) {
        const sum = user.waist + user.hip - user.neck;
        if (sum > 0) {
          const bfp = (495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.22100 * Math.log10(heightCm))) - 450;
          return Math.max(0, bfp).toFixed(1);
        }
      }
    }
  }

  // Fallback: BMI method
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const bfp = gender === 'female'
    ? (1.20 * bmi) + (0.23 * age) - 5.4
    : (1.20 * bmi) + (0.23 * age) - 16.2;
  return Math.max(0, bfp).toFixed(1);
}

// ─── USER ───────────────────────────────────────────────────────────────────────

app.get('/api/user', async (req, res) => {
  await getDb();
  res.json(get('SELECT * FROM user LIMIT 1') || null);
});

app.post('/api/user/setup', async (req, res) => {
  await getDb();
  const { height, weight, age, gender, target_calories, neck, waist, hip } = req.body;
  if (get('SELECT id FROM user LIMIT 1')) return res.status(400).json({ error: 'Already set up' });
  run(`INSERT INTO user (height, initial_weight, age, gender, target_calories, neck, waist, hip)
       VALUES (?,?,?,?,?,?,?,?)`,
    [height, weight, age || 25, gender || 'male', target_calories || 2000, neck || 0, waist || 0, hip || 0]);
  const today = new Date().toISOString().split('T')[0];
  run(`INSERT INTO weight_logs (date, weight) VALUES (?,?)`, [today, weight]);
  res.json({ success: true });
});

app.put('/api/user', async (req, res) => {
  await getDb();
  const { height, age, gender, target_calories, neck, waist, hip } = req.body;
  run(`UPDATE user SET height=?, age=?, gender=?, target_calories=?, neck=?, waist=?, hip=? WHERE id=1`,
    [height, age, gender, target_calories, neck || 0, waist || 0, hip || 0]);
  res.json({ success: true });
});

// ─── WEIGHT ──────────────────────────────────────────────────────────────────────

app.get('/api/weight', async (req, res) => {
  await getDb();
  res.json(query('SELECT * FROM weight_logs ORDER BY date ASC'));
});

app.post('/api/weight', async (req, res) => {
  await getDb();
  const { weight, date } = req.body;
  const d = date || new Date().toISOString().split('T')[0];
  if (get('SELECT id FROM weight_logs WHERE date=?', [d])) {
    run('UPDATE weight_logs SET weight=? WHERE date=?', [weight, d]);
  } else {
    run('INSERT INTO weight_logs (date, weight) VALUES (?,?)', [d, weight]);
  }
  res.json({ success: true });
});

// ─── FOOD ────────────────────────────────────────────────────────────────────────

app.get('/api/food', async (req, res) => {
  await getDb();
  res.json(query('SELECT * FROM food ORDER BY name'));
});

app.post('/api/food', async (req, res) => {
  await getDb();
  const { name, calories_per_unit, unit_label } = req.body;
  run(`INSERT INTO food (name, calories_per_unit, unit_label, category) VALUES (?,?,?,'general')`,
    [name, calories_per_unit, unit_label || 'serving']);
  res.json({ success: true });
});

// ─── INTAKE ──────────────────────────────────────────────────────────────────────

app.get('/api/intake', async (req, res) => {
  await getDb();
  const date = req.query.date || new Date().toISOString().split('T')[0];
  res.json(query(`
    SELECT dil.*, f.name, f.calories_per_unit, f.unit_label,
           COALESCE(dil.meal_category, 'breakfast') as category,
           (f.calories_per_unit * dil.quantity) as total_calories
    FROM daily_intake_logs dil
    JOIN food f ON f.id = dil.food_id
    WHERE dil.date=? ORDER BY dil.id
  `, [date]));
});

app.post('/api/intake', async (req, res) => {
  await getDb();
  const { food_id, quantity, date, category } = req.body;
  const d = date || new Date().toISOString().split('T')[0];
  run(`INSERT INTO daily_intake_logs (date, food_id, quantity, meal_category) VALUES (?,?,?,?)`,
    [d, food_id, quantity || 1, category || 'breakfast']);
  res.json({ success: true });
});

app.delete('/api/intake/:id', async (req, res) => {
  await getDb();
  run('DELETE FROM daily_intake_logs WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ─── SUMMARY ─────────────────────────────────────────────────────────────────────

app.get('/api/summary', async (req, res) => {
  await getDb();
  const date = req.query.date || new Date().toISOString().split('T')[0];

  const caloriesIn  = get(`SELECT COALESCE(SUM(f.calories_per_unit * dil.quantity),0) as total FROM daily_intake_logs dil JOIN food f ON f.id=dil.food_id WHERE dil.date=?`, [date]);
  const caloriesOut = get(`SELECT COALESCE(SUM(calories_burned),0) as total FROM workout_logs WHERE date=?`, [date]);
  const wLogged     = get(`SELECT COUNT(*) as count FROM workout_logs WHERE date=?`, [date]);
  const user        = get('SELECT * FROM user LIMIT 1');
  const latestW     = get('SELECT weight FROM weight_logs ORDER BY date DESC LIMIT 1');

  const consumed = caloriesIn.total;
  const burned   = caloriesOut.total;
  const target   = user ? user.target_calories : 2000;
  const remaining = (target + burned) - consumed;

  const heightM = user ? user.height / 100 : 1.75;
  const weight  = latestW ? latestW.weight : null;
  const bmi     = weight ? (weight / (heightM * heightM)).toFixed(1) : null;
  const bodyFat = (user && weight) ? calcBodyFat(user, weight) : null;

  // Day type for today
  const todayDate = new Date(date + 'T00:00:00');
  const dayType = getDayType(todayDate);

  res.json({ date, consumed, burned, target, remaining,
    workout_logged: wLogged.count > 0,
    bmi, body_fat: bodyFat, current_weight: weight,
    day_type: dayType, user });
});

// ─── WORKOUTS ────────────────────────────────────────────────────────────────────

app.get('/api/workouts', async (req, res) => {
  await getDb();
  res.json(query('SELECT * FROM workout ORDER BY category, name'));
});

app.get('/api/workout-logs', async (req, res) => {
  await getDb();
  const date = req.query.date || new Date().toISOString().split('T')[0];
  res.json(query(`
    SELECT wl.*, w.name, w.type, w.category, w.calories_per_minute, w.calories_per_rep
    FROM workout_logs wl JOIN workout w ON w.id=wl.workout_id
    WHERE wl.date=? ORDER BY wl.id DESC
  `, [date]));
});

app.post('/api/workout-logs', async (req, res) => {
  await getDb();
  const { workout_id, value, date } = req.body;
  const d = date || new Date().toISOString().split('T')[0];
  const workout = get('SELECT * FROM workout WHERE id=?', [workout_id]);
  if (!workout) return res.status(404).json({ error: 'Not found' });
  const calories_burned = workout.type === 'duration'
    ? workout.calories_per_minute * value
    : workout.calories_per_rep * value;
  run(`INSERT INTO workout_logs (date, workout_id, value, calories_burned) VALUES (?,?,?,?)`,
    [d, workout_id, value, calories_burned]);
  res.json({ success: true, calories_burned });
});

app.delete('/api/workout-logs/:id', async (req, res) => {
  await getDb();
  run('DELETE FROM workout_logs WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ─── PAST RECORDS ────────────────────────────────────────────────────────────────

app.get('/api/records', async (req, res) => {
  await getDb();
  res.json(query('SELECT * FROM daily_records ORDER BY date DESC LIMIT 90'));
});

// ─── DAY SNAPSHOT HELPER ─────────────────────────────────────────────────────────

async function snapshotAndClear(targetDate) {
  // targetDate is a Date object for the day being closed out
  const d = targetDate.toISOString().split('T')[0];

  const caloriesIn  = get(`SELECT COALESCE(SUM(f.calories_per_unit * dil.quantity),0) as total FROM daily_intake_logs dil JOIN food f ON f.id=dil.food_id WHERE dil.date=?`, [d]);
  const caloriesOut = get(`SELECT COALESCE(SUM(calories_burned),0) as total FROM workout_logs WHERE date=?`, [d]);
  const wLogged     = get(`SELECT COUNT(*) as count FROM workout_logs WHERE date=?`, [d]);
  const user        = get('SELECT * FROM user LIMIT 1');
  const target      = user ? user.target_calories : 2000;
  const consumed    = caloriesIn ? caloriesIn.total : 0;
  const burned      = caloriesOut ? caloriesOut.total : 0;
  const remaining   = (target + burned) - consumed;
  const dayType     = getDayType(targetDate);

  if (!get('SELECT id FROM daily_records WHERE date=?', [d])) {
    run(`INSERT INTO daily_records (date, day_type, consumed, burned, target, remaining, workout_logged)
         VALUES (?,?,?,?,?,?,?)`,
      [d, dayType, consumed, burned, target, remaining, wLogged.count > 0 ? 1 : 0]);
  }

  // Clear that day's logs
  run('DELETE FROM daily_intake_logs WHERE date=?', [d]);
  run('DELETE FROM workout_logs WHERE date=?', [d]);
  console.log(`  [Calorie Tracker] Snapshotted ${d} (${dayType}) — cleared logs.`);
}

// ─── MIDNIGHT RESET SCHEDULER ────────────────────────────────────────────────────

function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 5, 0); // 5ms past midnight
  const ms = midnight - now;
  console.log(`  [Calorie Tracker] Next reset in ${Math.round(ms / 60000)} min`);

  setTimeout(async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    try {
      await getDb();
      await snapshotAndClear(yesterday);
    } catch (e) {
      console.error('  [Calorie Tracker] Midnight reset error:', e.message);
    }
    scheduleMidnightReset(); // schedule next
  }, ms);
}

// ─── SERVE FRONTEND ──────────────────────────────────────────────────────────────

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ─── START ───────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Calorie Tracker → http://localhost:${PORT}\n`);
    scheduleMidnightReset();
  });
});
