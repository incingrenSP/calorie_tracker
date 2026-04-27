// ═══════════════════════════════════════════════════
//   CALORIE TRACKER — Frontend
// ════════════════════════════════════════════════════
const API = 'http://localhost:3000/api';

const DAY_TYPES   = ['push','pull','leg','push','pull','leg','rest'];
const DAY_LABELS  = { push:'PUSH DAY', pull:'PULL DAY', leg:'LEG DAY', rest:'REST DAY' };

let state = {
  user: null, summary: null,
  weightChart: null, calRingChart: null,
  workouts: [], selectedWorkout: null,
  currentTab: 'dashboard', currentMeal: 'breakfast',
  popupFoodId: null, popupCategory: null, popupCals: 0,
};

// ── Init ─────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch(`${API}/user`);
    state.user = await res.json();
  } catch {
    document.body.innerHTML = `<div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:Barlow,sans-serif;color:#e8eaed;background:#0d0f11;text-align:center"><div><div style="font-size:48px;margin-bottom:16px">⚠</div><h2 style="font-weight:900;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Server Not Running</h2><p style="color:#8a909a">Run <code style="background:#1a1d21;padding:4px 8px;border-radius:4px;color:#39d98a">node server.js</code></p></div></div>`;
    return;
  }

  // Show setup gender change → toggle hip field
  document.getElementById('setup-gender').addEventListener('change', function() {
    document.getElementById('setup-hip-wrap').classList.toggle('hidden', this.value !== 'female');
  });

  if (!state.user) {
    document.getElementById('setup-modal').classList.remove('hidden');
    return;
  }
  showApp();
}

function showApp() {
  document.getElementById('setup-modal').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  setupNav(); startClock(); loadDashboard(); initWater();
}

// ── Setup ────────────────────────────────────────────
async function submitSetup() {
  const height = parseFloat(document.getElementById('setup-height').value);
  const weight = parseFloat(document.getElementById('setup-weight').value);
  const age    = parseInt(document.getElementById('setup-age').value) || 25;
  const gender = document.getElementById('setup-gender').value;
  const target = parseInt(document.getElementById('setup-calories').value) || 2000;
  const neck   = parseFloat(document.getElementById('setup-neck').value) || 0;
  const waist  = parseFloat(document.getElementById('setup-waist').value) || 0;
  const hip    = parseFloat(document.getElementById('setup-hip').value) || 0;
  if (!height || !weight) return showToast('Height and weight required', 'error');

  await fetch(`${API}/user/setup`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ height, weight, age, gender, target_calories: target, neck, waist, hip })
  });
  const res = await fetch(`${API}/user`);
  state.user = await res.json();
  showApp();
  showToast('Welcome to Calorie Tracker!', 'success');
}

// ── Navigation ───────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); switchTab(link.dataset.tab); });
  });
}

async function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));
  if (tab === 'dashboard') await loadDashboard();
  else if (tab === 'calories') await loadCaloriesTab();
  else if (tab === 'workout') await loadWorkoutTab();
  else if (tab === 'records') await loadRecordsTab();
}

// ── Clock ────────────────────────────────────────────
function startClock() {
  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function tick() {
    const now = new Date();
    document.getElementById('dash-day').textContent  = DAYS[now.getDay()];
    document.getElementById('dash-date').textContent = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    document.getElementById('dash-time').textContent = now.toLocaleTimeString('en-US',{hour12:false});
  }
  tick(); setInterval(tick, 1000);
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ═══════════════════════════════════════════════════
//   WATER TRACKER
// ════════════════════════════════════════════════════
function initWater() {
  const data = JSON.parse(localStorage.getItem(`water_${todayStr()}`) || '{"chugs":0}');
  renderWater(data.chugs);
}

function renderWater(chugs) {
  document.getElementById('water-amount').textContent = `${chugs.toFixed(1)}L`;
  for (let i = 0; i < 5; i++) {
    const s = document.getElementById(`wseg-${i}`);
    s.className = 'water-segment';
    if (i < chugs) s.classList.add(i < 3 ? 'filled-green' : 'filled-gold');
  }
  const btn = document.getElementById('chug-btn');
  const txt = document.getElementById('water-status-text');
  if (chugs >= 5) { btn.disabled = true; btn.textContent = '✓ Goal Reached!'; txt.textContent = 'Daily goal met!'; }
  else { btn.disabled = false; btn.textContent = '💧 Chug!'; txt.textContent = `${5 - chugs}L to go`; }
}

function chug() {
  const key = `water_${todayStr()}`;
  const data = JSON.parse(localStorage.getItem(key) || '{"chugs":0}');
  if (data.chugs >= 5) return;
  data.chugs++;
  localStorage.setItem(key, JSON.stringify(data));
  renderWater(data.chugs);
  const msgs = ['Stay hydrated!','Keep it up!','Halfway!','Almost there!','Goal reached! 🎉'];
  showToast(msgs[data.chugs - 1], 'success');
}

// ═══════════════════════════════════════════════════
//   DASHBOARD
// ════════════════════════════════════════════════════
async function loadDashboard() {
  const [sRes, wRes] = await Promise.all([fetch(`${API}/summary`), fetch(`${API}/weight`)]);
  state.summary = await sRes.json();
  const weights = await wRes.json();

  // Stats
  document.getElementById('dash-consumed').textContent = Math.round(state.summary.consumed);
  document.getElementById('dash-burned').textContent   = Math.round(state.summary.burned);
  document.getElementById('dash-remaining').textContent= Math.round(state.summary.remaining);
  const ws = document.getElementById('dash-workout-status');
  ws.textContent = state.summary.workout_logged ? '✓ Yes' : '✗ No';
  ws.style.color = state.summary.workout_logged ? 'var(--green)' : 'var(--text2)';
  document.getElementById('dash-bmi').textContent    = state.summary.bmi || '—';
  document.getElementById('dash-bodyfat').textContent= state.summary.body_fat ? `${state.summary.body_fat}%` : '—';
  document.getElementById('dash-weight').textContent = state.summary.current_weight || '—';
  document.getElementById('dash-target').textContent = state.summary.target;

  // Workout day badge
  const dayType = state.summary.day_type || DAY_TYPES[new Date().getDay()];
  const badge   = document.getElementById('dash-day-type');
  badge.textContent  = DAY_LABELS[dayType] || `${dayType.toUpperCase()} DAY`;
  badge.className    = `day-${dayType}`;

  // Workout day label on workout tab
  const wdl = document.getElementById('workout-day-label');
  if (wdl) wdl.textContent = `Today — ${DAY_LABELS[dayType] || dayType}`;

  renderWeightChart(weights);

  // Weight log list
  const el = document.getElementById('weight-log-list');
  el.innerHTML = weights.length === 0
    ? `<div class="empty-state">No entries yet</div>`
    : [...weights].reverse().slice(0, 6).map(w =>
        `<div class="weight-log-item"><span>${fmtDate(w.date)}</span><span>${w.weight} kg</span></div>`
      ).join('');

  initWater();
}

function renderWeightChart(weights) {
  const canvas = document.getElementById('weight-chart');
  if (state.weightChart) state.weightChart.destroy();
  if (!weights.length) return;
  state.weightChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: weights.map(w => { const d = new Date(w.date+'T00:00:00'); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }),
      datasets: [{ data: weights.map(w => w.weight), borderColor:'#39d98a', backgroundColor:'rgba(57,217,138,.08)', borderWidth:2, pointBackgroundColor:'#39d98a', pointRadius:4, fill:true, tension:.35 }]
    },
    options: {
      responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{display:false} },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#555c68',font:{family:'DM Mono',size:10}} },
        y:{ grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#555c68',font:{family:'DM Mono',size:10},callback:v=>`${v}kg`} }
      }
    }
  });
}

async function logWeight() {
  const val = parseFloat(document.getElementById('weight-input').value);
  if (!val || val < 20 || val > 400) return showToast('Enter a valid weight', 'error');
  await fetch(`${API}/weight`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({weight:val, date:todayStr()}) });
  document.getElementById('weight-input').value = '';
  await loadDashboard();
  showToast('Weight logged!', 'success');
}

// ═══════════════════════════════════════════════════
//   CALORIES TAB
// ════════════════════════════════════════════════════
async function loadCaloriesTab() {
  const sum = await (await fetch(`${API}/summary`)).json();
  document.getElementById('cal-date-label').textContent  = fmtDate(todayStr());
  document.getElementById('cal-target').textContent   = Math.round(sum.target);
  document.getElementById('cal-burned').textContent   = Math.round(sum.burned);
  document.getElementById('cal-consumed').textContent = Math.round(sum.consumed);
  document.getElementById('cal-remaining').textContent= Math.round(sum.remaining);
  document.getElementById('ring-remaining').textContent= Math.round(sum.remaining);
  renderCalRing(sum);
  await loadMealSubtab(state.currentMeal);
}

function renderCalRing(sum) {
  const canvas = document.getElementById('cal-ring');
  if (state.calRingChart) state.calRingChart.destroy();
  const budget = (sum.target + sum.burned) || sum.target;
  const consumed = sum.consumed || 0;
  const over = Math.max(0, consumed - budget);
  state.calRingChart = new Chart(canvas, {
    type:'doughnut',
    data:{ datasets:[{ data: over > 0 ? [budget,over] : [consumed, Math.max(0,budget-consumed)],
      backgroundColor: over > 0 ? ['#f87171','#3d1515'] : ['#ff8c42','rgba(255,255,255,.06)'],
      borderWidth:0 }] },
    options:{ cutout:'75%', responsive:true, plugins:{legend:{display:false},tooltip:{enabled:false}} }
  });
}

async function switchMealSubtab(meal, btn) {
  state.currentMeal = meal;
  document.querySelectorAll('.meal-subtab').forEach(t => t.classList.toggle('active', t.dataset.meal === meal));
  document.getElementById('meal-sidebar-label').textContent = meal.charAt(0).toUpperCase() + meal.slice(1);
  await loadMealSubtab(meal);
}

async function loadMealSubtab(category) {
  const [foods, allIntake] = await Promise.all([
    fetch(`${API}/food`).then(r => r.json()),
    fetch(`${API}/intake?date=${todayStr()}`).then(r => r.json())
  ]);
  const intake = allIntake.filter(i => i.category === category);

  // Food grid — all foods available in every tab
  const grid = document.getElementById('food-grid-main');
  grid.innerHTML = foods.length === 0
    ? `<div class="empty-state" style="grid-column:1/-1">No foods in database.<br>Add via DB Browser.</div>`
    : foods.map(f => `
        <div class="food-card" onclick="openServingPopup(${f.id},'${esc(f.name)}',${f.calories_per_unit},'${f.unit_label}','${category}')">
          <div class="food-name">${f.name}</div>
          <div class="food-cal">${f.calories_per_unit}</div>
          <div class="food-unit">kcal / ${f.unit_label}</div>
          <button class="food-add-btn" onclick="event.stopPropagation();openServingPopup(${f.id},'${esc(f.name)}',${f.calories_per_unit},'${f.unit_label}','${category}')">+</button>
        </div>`
      ).join('');

  // Logged sidebar
  const logEl   = document.getElementById('meal-log-main');
  const totalEl = document.getElementById('meal-total-main');
  logEl.innerHTML = intake.length === 0
    ? `<div class="empty-state">Nothing logged yet</div>`
    : intake.map(item => `
        <div class="meal-log-item">
          <span class="meal-log-item-name">${item.name}${item.quantity !== 1 ? ` <em style="color:var(--text3)">×${item.quantity}</em>` : ''}</span>
          <span class="meal-log-item-cal">${Math.round(item.total_calories)} kcal</span>
          <button class="meal-log-item-del" onclick="removeMealItem(${item.id})">✕</button>
        </div>`
      ).join('');
  totalEl.textContent = Math.round(intake.reduce((s,i) => s + i.total_calories, 0));
}

async function removeMealItem(id) {
  await fetch(`${API}/intake/${id}`, { method:'DELETE' });
  await loadCaloriesTab();
  showToast('Removed');
}

// ── Serving Popup ─────────────────────────────────────
function openServingPopup(foodId, name, cals, unit, category) {
  state.popupFoodId  = foodId;
  state.popupCategory = category;
  state.popupCals    = cals;
  document.getElementById('popup-food-name').textContent = name;
  document.getElementById('popup-food-meta').textContent = `${cals} kcal / ${unit}`;
  document.getElementById('serving-qty').value = 1;
  document.getElementById('serving-total-cal').textContent = cals;
  document.getElementById('serving-popup').classList.remove('hidden');
  setTimeout(() => { document.getElementById('serving-qty').focus(); document.getElementById('serving-qty').select(); }, 50);
}

function closeServingPopup() {
  document.getElementById('serving-popup').classList.add('hidden');
}

function stepServing(delta) {
  const inp = document.getElementById('serving-qty');
  inp.value = Math.max(0.5, (parseFloat(inp.value) || 1) + delta);
  updateServingCalc();
}

function updateServingCalc() {
  const qty = parseFloat(document.getElementById('serving-qty').value) || 1;
  document.getElementById('serving-total-cal').textContent = Math.round(state.popupCals * qty);
}

async function confirmServing() {
  const qty = parseFloat(document.getElementById('serving-qty').value) || 1;
  if (qty <= 0) return showToast('Enter a valid amount', 'error');
  closeServingPopup();
  await fetch(`${API}/intake`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ food_id: state.popupFoodId, quantity: qty, date: todayStr(), category: state.popupCategory })
  });
  await loadCaloriesTab();
  showToast(`Logged ×${qty}!`, 'success');
}

// Close popup on backdrop click
document.addEventListener('click', e => {
  const popup = document.getElementById('serving-popup');
  if (popup && e.target === popup) closeServingPopup();
});

// ═══════════════════════════════════════════════════
//   WORKOUT TAB
// ════════════════════════════════════════════════════
async function loadWorkoutTab() {
  const [workouts, logs] = await Promise.all([
    fetch(`${API}/workouts`).then(r => r.json()),
    fetch(`${API}/workout-logs?date=${todayStr()}`).then(r => r.json())
  ]);
  state.workouts = workouts;
  renderWorkoutList(workouts);
  renderWorkoutLogs(logs);
}

function renderWorkoutList(list) {
  document.getElementById('workout-list').innerHTML = list.map(w => `
    <div class="workout-item ${state.selectedWorkout?.id === w.id ? 'active-workout' : ''}" onclick="selectWorkout(${w.id})">
      <div>
        <div class="workout-item-name">${w.name}</div>
        <div class="workout-item-meta">${w.type === 'duration' ? `${w.calories_per_minute} kcal/min` : `${w.calories_per_rep} kcal/rep`}</div>
      </div>
      <span class="workout-item-badge badge-${w.category}">${w.category}</span>
    </div>`).join('');
}

function filterWorkouts(cat, btn) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderWorkoutList(cat === 'all' ? state.workouts : state.workouts.filter(w => w.category === cat));
}

function selectWorkout(id) {
  state.selectedWorkout = state.workouts.find(w => w.id === id);
  const w = state.selectedWorkout;
  document.getElementById('workout-placeholder').style.display = 'none';
  document.getElementById('workout-form').style.display = 'block';
  document.getElementById('workout-form-title').textContent = w.name;
  document.getElementById('workout-form-meta').textContent  = w.type === 'duration' ? `${w.calories_per_minute} kcal/min · ${w.category}` : `${w.calories_per_rep} kcal/rep · ${w.category}`;
  document.getElementById('workout-unit-label').textContent = w.type === 'duration' ? 'minutes' : 'reps';
  document.getElementById('workout-value').value = '';
  document.getElementById('est-cal-burn').textContent = '0';
  document.getElementById('workout-value').oninput = function() {
    const v = parseFloat(this.value) || 0;
    document.getElementById('est-cal-burn').textContent = w.type === 'duration' ? Math.round(v * w.calories_per_minute) : Math.round(v * w.calories_per_rep);
  };
  renderWorkoutList(state.workouts);
}

function clearWorkoutForm() {
  state.selectedWorkout = null;
  document.getElementById('workout-form').style.display = 'none';
  document.getElementById('workout-placeholder').style.display = 'block';
  renderWorkoutList(state.workouts);
}

async function logWorkout() {
  const value = parseFloat(document.getElementById('workout-value').value);
  if (!value || value <= 0) return showToast('Enter a valid value', 'error');
  const res  = await fetch(`${API}/workout-logs`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ workout_id: state.selectedWorkout.id, value, date: todayStr() })
  });
  const data = await res.json();
  clearWorkoutForm();
  await loadWorkoutTab();
  showToast(`Logged! ${Math.round(data.calories_burned)} kcal burned`, 'success');
}

function renderWorkoutLogs(logs) {
  const el = document.getElementById('workout-today-list');
  el.innerHTML = logs.length === 0
    ? `<div class="empty-state">No workouts today</div>`
    : logs.map(log => `
        <div class="workout-log-entry">
          <div>
            <div class="workout-entry-name">${log.name}</div>
            <div class="workout-entry-detail">${log.type === 'duration' ? `${log.value} min` : `${log.value} reps`} · ${log.category}</div>
          </div>
          <div style="display:flex;align-items:center;gap:7px">
            <span class="workout-entry-cal">${Math.round(log.calories_burned)} kcal</span>
            <button class="workout-entry-del" onclick="deleteWorkoutLog(${log.id})">✕</button>
          </div>
        </div>`).join('');
}

async function deleteWorkoutLog(id) {
  await fetch(`${API}/workout-logs/${id}`, { method:'DELETE' });
  await loadWorkoutTab();
  showToast('Removed');
}

// ═══════════════════════════════════════════════════
//   PAST RECORDS TAB
// ════════════════════════════════════════════════════
async function loadRecordsTab() {
  const records = await fetch(`${API}/records`).then(r => r.json());
  const el = document.getElementById('records-list');

  if (records.length === 0) {
    el.innerHTML = `<div class="records-empty"><span>📋</span>No records yet.<br>Your first day will be saved automatically at midnight.</div>`;
    return;
  }

  el.innerHTML = records.map(r => {
    const dayType = r.day_type || 'rest';
    const remaining = Math.round(r.remaining);
    const remColor  = remaining >= 0 ? 'green' : 'red';
    return `
      <div class="record-card">
        <div class="record-date">${fmtDate(r.date)}</div>
        <div class="record-day-badge ${dayType}">${dayType}</div>
        <div class="record-stat">
          <span class="record-stat-label">Consumed</span>
          <span class="record-stat-value orange">${Math.round(r.consumed)}</span>
        </div>
        <div class="record-stat">
          <span class="record-stat-label">Burned</span>
          <span class="record-stat-value green">${Math.round(r.burned)}</span>
        </div>
        <div class="record-stat">
          <span class="record-stat-label">Target</span>
          <span class="record-stat-value">${Math.round(r.target)}</span>
        </div>
        <div class="record-stat">
          <span class="record-stat-label">Remaining</span>
          <span class="record-stat-value ${remColor}">${remaining}</span>
        </div>
        <div class="record-workout-chip ${r.workout_logged ? 'yes' : 'no'}">${r.workout_logged ? '✓ Trained' : '✗ Rest'}</div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
//   SETTINGS
// ════════════════════════════════════════════════════
async function openSettings() {
  const u = state.user;
  if (u) {
    document.getElementById('settings-height').value   = u.height;
    document.getElementById('settings-age').value      = u.age;
    document.getElementById('settings-gender').value   = u.gender;
    document.getElementById('settings-calories').value = u.target_calories;
    document.getElementById('settings-neck').value     = u.neck || '';
    document.getElementById('settings-waist').value    = u.waist || '';
    document.getElementById('settings-hip').value      = u.hip || '';
  }
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }

async function saveSettings() {
  await fetch(`${API}/user`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      height:         parseFloat(document.getElementById('settings-height').value),
      age:            parseInt(document.getElementById('settings-age').value),
      gender:         document.getElementById('settings-gender').value,
      target_calories:parseInt(document.getElementById('settings-calories').value),
      neck:           parseFloat(document.getElementById('settings-neck').value) || 0,
      waist:          parseFloat(document.getElementById('settings-waist').value) || 0,
      hip:            parseFloat(document.getElementById('settings-hip').value) || 0,
    })
  });
  state.user = await (await fetch(`${API}/user`)).json();
  closeSettings();
  showToast('Settings saved!', 'success');
  await loadDashboard();
}

// ═══════════════════════════════════════════════════
//   UTILITIES
// ════════════════════════════════════════════════════
function fmtDate(d) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}
function esc(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

let toastTimer;
function showToast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type}`; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

init();
