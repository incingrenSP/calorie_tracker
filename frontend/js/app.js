// ═══════════════════════════════════════════════════
//   CALORIE TRACKER — Frontend Application Logic
// ════════════════════════════════════════════════════

const API = 'http://localhost:8000/api';

let state = {
  user: null,
  summary: null,
  weightChart: null,
  calRingChart: null,
  workouts: [],
  selectedWorkout: null,
  currentTab: 'dashboard',
  currentMeal: 'breakfast',
};

// Workout routine: week starts Sunday
// Sun=Push, Mon=Pull, Tue=Leg, Wed=Push, Thu=Pull, Fri=Leg, Sat=Break
const ROUTINE = ['PUSH DAY', 'PULL DAY', 'LEG DAY', 'PUSH DAY', 'PULL DAY', 'LEG DAY', 'REST DAY'];
const ROUTINE_COLOR = ['#ff8c42','#5b9cf6','#39d98a','#ff8c42','#5b9cf6','#39d98a','#a78bfa'];

// ── Init ─────────────────────────────────────────────
async function init() {
  await checkUser();
  if (state.user) {
    showApp();
    setupNavigation();
    startClock();
    await loadDashboard();
    initWater();
    scheduleMidnightReset();
  }
}

async function checkUser() {
  try {
    const res = await fetch(`${API}/user`);
    state.user = await res.json();
  } catch (e) {
    document.body.innerHTML = `
      <div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:Barlow,sans-serif;color:#e8eaed;background:#0d0f11;text-align:center;padding:20px;">
        <div>
          <div style="font-size:48px;margin-bottom:16px;">⚠</div>
          <h2 style="font-size:20px;margin-bottom:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;">Server Not Running</h2>
          <p style="color:#8a909a;font-size:14px;">Run <code style="background:#1a1d21;padding:4px 8px;border-radius:4px;color:#39d98a;">node server.js</code> to start CalorieTracker</p>
        </div>
      </div>`;
    return;
  }
  if (!state.user) {
    document.getElementById('setup-modal').classList.remove('hidden');
  }
}

function showApp() {
  document.getElementById('setup-modal').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

// ── Setup ────────────────────────────────────────────
async function submitSetup() {
  const height = parseFloat(document.getElementById('setup-height').value);
  const weight = parseFloat(document.getElementById('setup-weight').value);
  const neck = parseFloat(document.getElementById('setup-neck').value) || 0;
  const waist = parseFloat(document.getElementById('setup-waist').value) || 0;
  const age = parseInt(document.getElementById('setup-age').value) || 25;
  const gender = document.getElementById('setup-gender').value;
  const target_calories = parseInt(document.getElementById('setup-calories').value) || 2000;
  if (!height || !weight) return showToast('Please fill in height and weight', 'error');
  await fetch(`${API}/user/setup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ height, weight, neck, waist, age, gender, target_calories })
  });
  const res = await fetch(`${API}/user`);
  state.user = await res.json();
  showApp(); setupNavigation(); startClock();
  await loadDashboard(); initWater();
  scheduleMidnightReset();
  showToast('Welcome to CalorieTracker!', 'success');
}

// ── Navigation ───────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      switchTab(link.dataset.tab);
    });
  });
}

async function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));
  switch(tab) {
    case 'dashboard': await loadDashboard(); break;
    case 'calories':  await loadCaloriesTab(); break;
    case 'workout':   await loadWorkoutTab(); break;
    case 'records':   await loadPastRecords(); break;
  }
}

// ── Clock ────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('dash-day').textContent = days[now.getDay()];
    document.getElementById('dash-date').textContent = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    document.getElementById('dash-time').textContent = now.toLocaleTimeString('en-US', { hour12: false });

    // Workout routine day
    const dayIdx = now.getDay(); // 0=Sun
    const routineEl = document.getElementById('dash-routine-day');
    if (routineEl) {
      routineEl.textContent = ROUTINE[dayIdx];
      routineEl.style.color = ROUTINE_COLOR[dayIdx];
    }
  }
  tick(); setInterval(tick, 1000);
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// ═══════════════════════════════════════════════════
//   WATER TRACKER
// ════════════════════════════════════════════════════
// Stored in localStorage: { date, chugs }
// 5 segments = 5L total, 1 chug = 1L
// Segments 0-2 (1-3L) = green, segments 3-4 (4-5L) = gold

function waterKey() { return `water_${todayStr()}`; }

function initWater() {
  // Reset if it's a new day
  const stored = JSON.parse(localStorage.getItem(waterKey()) || '{"chugs":0}');
  renderWater(stored.chugs);
}

function renderWater(chugs) {
  const amount = chugs; // each chug = 1L
  document.getElementById('water-amount').textContent = `${amount.toFixed(1)}L`;

  for (let i = 0; i < 5; i++) {
    const seg = document.getElementById(`wseg-${i}`);
    seg.className = 'water-segment';
    if (i < chugs) {
      seg.classList.add(i < 3 ? 'filled-green' : 'filled-gold');
    }
  }

  const btn = document.getElementById('chug-btn');
  const statusEl = document.getElementById('water-status-text');

  if (chugs >= 5) {
    btn.disabled = true;
    btn.textContent = '✓ Goal Reached!';
    statusEl.textContent = 'Daily goal met — great work!';
  } else if (chugs >= 3) {
    btn.disabled = false;
    btn.textContent = '💧 Chug!';
    statusEl.textContent = `${5 - chugs}L to go — you're past the green zone!`;
  } else {
    btn.disabled = false;
    btn.textContent = '💧 Chug!';
    statusEl.textContent = `${5 - chugs}L remaining to hit daily maximum`;
  }
}

function chug() {
  const key = waterKey();
  const stored = JSON.parse(localStorage.getItem(key) || '{"chugs":0}');
  if (stored.chugs >= 5) return;
  stored.chugs += 1;
  localStorage.setItem(key, JSON.stringify(stored));
  renderWater(stored.chugs);
  const msgs = ['Hydrated!', 'Keep it up!', 'Green zone!', 'Golden zone!', 'Goal reached!'];
  showToast(msgs[stored.chugs - 1] || 'Hydrated!', 'success');
}

// ═══════════════════════════════════════════════════
//   DASHBOARD
// ════════════════════════════════════════════════════
async function loadDashboard() {
  const [summaryRes, weightRes] = await Promise.all([
    fetch(`${API}/summary`), fetch(`${API}/weight`)
  ]);
  state.summary = await summaryRes.json();
  const weights = await weightRes.json();

  document.getElementById('dash-consumed').textContent = Math.round(state.summary.consumed);
  document.getElementById('dash-burned').textContent = Math.round(state.summary.burned);
  document.getElementById('dash-remaining').textContent = Math.round(state.summary.remaining);
  const ws = document.getElementById('dash-workout-status');
  ws.textContent = state.summary.workout_logged ? '✓ Yes' : '✗ No';
  ws.style.color = state.summary.workout_logged ? 'var(--green)' : 'var(--text2)';
  document.getElementById('dash-bmi').textContent = state.summary.bmi || '—';
  document.getElementById('dash-bodyfat').textContent = state.summary.body_fat ? `${state.summary.body_fat}%` : '—';
  document.getElementById('dash-weight').textContent = state.summary.current_weight || '—';
  document.getElementById('dash-target').textContent = state.summary.target;

  renderWeightChart(weights);

  const logEl = document.getElementById('weight-log-list');
  if (weights.length === 0) {
    logEl.innerHTML = `<div class="empty-state">No weight entries yet</div>`;
  } else {
    logEl.innerHTML = weights.slice().reverse().slice(0, 6).map(w => `
      <div class="weight-log-item"><span>${formatDate(w.date)}</span><span>${w.weight} kg</span></div>
    `).join('');
  }

  // Refresh water display in case day changed
  initWater();
}

function renderWeightChart(weights) {
  const canvas = document.getElementById('weight-chart');
  if (state.weightChart) state.weightChart.destroy();
  if (weights.length < 1) return;

  state.weightChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: weights.map(w => { const d = new Date(w.date+'T00:00:00'); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }),
      datasets: [{ data: weights.map(w => w.weight), borderColor: '#39d98a', backgroundColor: 'rgba(57,217,138,0.08)', borderWidth: 2, pointBackgroundColor: '#39d98a', pointRadius: 5, pointHoverRadius: 7, fill: true, tension: 0.35 }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#555c68', font: { family: 'DM Mono', size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#555c68', font: { family: 'DM Mono', size: 11 }, callback: v => `${v}kg` } }
      }
    }
  });
}

async function logWeight() {
  const val = parseFloat(document.getElementById('weight-input').value);
  if (!val || val < 20 || val > 400) return showToast('Enter a valid weight', 'error');
  await fetch(`${API}/weight`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weight: val, date: todayStr() }) });
  document.getElementById('weight-input').value = '';
  await loadDashboard();
  showToast('Weight logged!', 'success');
}

// ═══════════════════════════════════════════════════
//   PAST RECORDS
// ════════════════════════════════════════════════════
async function loadPastRecords() {
  const res = await fetch(`${API}/past-records`);
  const records = await res.json();
  const el = document.getElementById('past-records-list');
  if (!records.length) {
    el.innerHTML = `<div class="empty-state">No records yet. Records are saved automatically at midnight.</div>`;
    return;
  }
  el.innerHTML = records.map(r => {
    const net = Math.round((r.target + r.burned) - r.consumed);
    const netColor = net >= 0 ? 'var(--green)' : 'var(--red)';
    const d = new Date(r.date + 'T00:00:00');
    const dayIdx = d.getDay();
    return `
      <div class="past-record-card">
        <div class="past-record-date">${formatDate(r.date)}</div>
        <div class="past-record-routine" style="color:${ROUTINE_COLOR[dayIdx]}">${ROUTINE[dayIdx]}</div>
        <div class="past-record-row"><span>Consumed</span><span>${Math.round(r.consumed)} kcal</span></div>
        <div class="past-record-row"><span>Burned</span><span>${Math.round(r.burned)} kcal</span></div>
        <div class="past-record-row"><span>Target</span><span>${Math.round(r.target)} kcal</span></div>
        <div class="past-record-row past-record-net"><span>Net</span><span style="color:${netColor}">${net > 0 ? '+' : ''}${net}</span></div>
        ${r.weight ? `<div class="past-record-row"><span>Weight</span><span>${r.weight} kg</span></div>` : ''}
      </div>
    `;
  }).join('');
}

async function scheduleMidnightReset() {
  async function midnightTask() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];

    // Snapshot yesterday's data as a past record
    await fetch(`${API}/past-records/snapshot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: yStr })
    });

    // Reload past records panel and dashboard (calorie meter naturally resets since it's a new day)
    await loadPastRecords();
    await loadDashboard();
    showToast('New day! Calorie meter reset.', 'success');
  }

  function scheduleNext() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 5, 0); // 00:00:05 next day
    const msUntilMidnight = midnight - now;
    setTimeout(async () => {
      await midnightTask();
      scheduleNext(); // reschedule for next midnight
    }, msUntilMidnight);
  }

  scheduleNext();
}

// ═══════════════════════════════════════════════════
//   CALORIES TAB
async function loadCaloriesTab() {
  const [summaryRes, intakeRes] = await Promise.all([
    fetch(`${API}/summary`),
    fetch(`${API}/intake?date=${todayStr()}`)
  ]);
  const summary = await summaryRes.json();

  document.getElementById('cal-date-label').textContent = formatDate(todayStr());
  document.getElementById('cal-target').textContent = Math.round(summary.target);
  document.getElementById('cal-burned').textContent = Math.round(summary.burned);
  document.getElementById('cal-consumed').textContent = Math.round(summary.consumed);
  document.getElementById('cal-remaining').textContent = Math.round(summary.remaining);
  document.getElementById('ring-remaining').textContent = Math.round(summary.remaining);

  renderCalRing(summary);

  // Load the currently active meal sub-tab
  await loadMealSubtab(state.currentMeal);
}

function renderCalRing(summary) {
  const canvas = document.getElementById('cal-ring');
  if (state.calRingChart) state.calRingChart.destroy();
  const consumed = summary.consumed || 0;
  const budget = (summary.target + summary.burned) || summary.target;
  const remaining = Math.max(0, budget - consumed);
  const over = Math.max(0, consumed - budget);
  state.calRingChart = new Chart(canvas, {
    type: 'doughnut',
    data: { datasets: [{ data: over > 0 ? [budget, over] : [consumed, remaining], backgroundColor: over > 0 ? ['#f87171','#3d1515'] : ['#ff8c42','rgba(255,255,255,0.06)'], borderWidth: 0, hoverOffset: 4 }] },
    options: { cutout: '75%', responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
  });
}

async function switchMealSubtab(meal, btn) {
  state.currentMeal = meal;
  document.querySelectorAll('.meal-subtab').forEach(t => t.classList.toggle('active', t.dataset.meal === meal));
  document.getElementById('meal-sidebar-label').textContent = meal.charAt(0).toUpperCase() + meal.slice(1);
  await loadMealSubtab(meal);
}

async function loadMealSubtab(category) {
  const [foodsRes, intakeRes] = await Promise.all([
    fetch(`${API}/food`),                              // all foods, no category filter
    fetch(`${API}/intake?date=${todayStr()}`)
  ]);
  const foods = await foodsRes.json();
  const allIntake = await intakeRes.json();
  const intake = allIntake.filter(i => i.category === category);

  // Food grid — all foods available in every tab
  const gridEl = document.getElementById('food-grid-main');
  if (foods.length === 0) {
    gridEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No foods in database.<br>Add them via DB Browser.</div>`;
  } else {
    gridEl.innerHTML = foods.map(f => `
      <div class="food-card" onclick="openServingPopup(${f.id}, '${f.name.replace(/'/g,"\\'")}', ${f.calories_per_unit}, '${f.unit_label}', '${category}')">
        <div class="food-name">${f.name}</div>
        <div class="food-cal">${f.calories_per_unit}</div>
        <div class="food-unit">kcal / ${f.unit_label}</div>
        <button class="food-add-btn" onclick="event.stopPropagation(); openServingPopup(${f.id}, '${f.name.replace(/'/g,"\\'")}', ${f.calories_per_unit}, '${f.unit_label}', '${category}')">+</button>
      </div>
    `).join('');
  }

  // Meal log sidebar
  const logEl = document.getElementById('meal-log-main');
  const totalEl = document.getElementById('meal-total-main');
  if (intake.length === 0) {
    logEl.innerHTML = `<div class="empty-state">Nothing logged yet</div>`;
  } else {
    logEl.innerHTML = intake.map(item => `
      <div class="meal-log-item">
        <span class="meal-log-item-name">${item.name} ${item.quantity > 1 ? `<em style="color:var(--text3)">×${item.quantity}</em>` : ''}</span>
        <span class="meal-log-item-cal">${Math.round(item.total_calories)} kcal</span>
        <button class="meal-log-item-del" onclick="removeMealItem(${item.id})">✕</button>
      </div>
    `).join('');
  }
  totalEl.textContent = Math.round(intake.reduce((s, i) => s + i.total_calories, 0));
}

// ── Serving Popup ────────────────────────────────────
function openServingPopup(foodId, foodName, calsPerUnit, unitLabel, category) {
  // Remove any existing popup
  document.getElementById('serving-popup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'serving-popup';
  popup.className = 'serving-popup-overlay';
  popup.innerHTML = `
    <div class="serving-popup-box">
      <div class="serving-popup-header">
        <div>
          <div class="serving-popup-name">${foodName}</div>
          <div class="serving-popup-meta">${calsPerUnit} kcal / ${unitLabel}</div>
        </div>
        <button class="btn-close" onclick="document.getElementById('serving-popup').remove()">✕</button>
      </div>
      <div class="serving-popup-body">
        <label class="serving-label">Number of servings</label>
        <div class="serving-input-row">
          <button class="serving-stepper" onclick="stepServing(-0.5)">−</button>
          <input type="number" id="serving-qty" value="1" min="0.5" step="0.5" oninput="updateServingCalc(${calsPerUnit})"/>
          <button class="serving-stepper" onclick="stepServing(0.5)">+</button>
        </div>
        <div class="serving-calc">
          = <span id="serving-total-cal">${calsPerUnit}</span> kcal
        </div>
      </div>
      <button class="btn-primary serving-confirm" onclick="confirmServing(${foodId}, '${category}')">Log It →</button>
    </div>
  `;

  // Close on backdrop click
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
  document.body.appendChild(popup);
  document.getElementById('serving-qty').focus();
  document.getElementById('serving-qty').select();
}

function stepServing(delta) {
  const input = document.getElementById('serving-qty');
  const newVal = Math.max(0.5, (parseFloat(input.value) || 1) + delta);
  input.value = newVal;
  // trigger recalc — read cals from the popup meta text
  const meta = document.querySelector('.serving-popup-meta').textContent;
  const cals = parseFloat(meta);
  updateServingCalc(cals);
}

function updateServingCalc(calsPerUnit) {
  const qty = parseFloat(document.getElementById('serving-qty').value) || 1;
  document.getElementById('serving-total-cal').textContent = Math.round(calsPerUnit * qty);
}

async function confirmServing(foodId, category) {
  const qty = parseFloat(document.getElementById('serving-qty').value) || 1;
  if (qty <= 0) return showToast('Enter a valid amount', 'error');

  document.getElementById('serving-popup').remove();

  await fetch(`${API}/intake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ food_id: foodId, quantity: qty, date: todayStr(), category })
  });

  await loadCaloriesTab();
  showToast(`Logged ×${qty} serving${qty !== 1 ? 's' : ''}!`, 'success');
}

async function removeMealItem(id) {
  await fetch(`${API}/intake/${id}`, { method: 'DELETE' });
  await loadCaloriesTab();
  showToast('Removed');
}

// ═══════════════════════════════════════════════════
//   WORKOUT TAB
// ════════════════════════════════════════════════════
async function loadWorkoutTab() {
  const [workoutsRes, logsRes] = await Promise.all([
    fetch(`${API}/workouts`), fetch(`${API}/workout-logs?date=${todayStr()}`)
  ]);
  state.workouts = await workoutsRes.json();
  const logs = await logsRes.json();
  renderWorkoutList(state.workouts);
  renderWorkoutLogs(logs);
}

function renderWorkoutList(workouts) {
  document.getElementById('workout-list').innerHTML = workouts.map(w => `
    <div class="workout-item ${state.selectedWorkout?.id === w.id ? 'active-workout' : ''}" onclick="selectWorkout(${w.id})">
      <div>
        <div class="workout-item-name">${w.name}</div>
        <div class="workout-item-meta">${w.type === 'duration' ? `${w.calories_per_minute} kcal/min` : `${w.calories_per_rep} kcal/rep`}</div>
      </div>
      <span class="workout-item-badge badge-${w.category}">${w.category}</span>
    </div>
  `).join('');
}

function filterWorkouts(cat, btn) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderWorkoutList(cat === 'all' ? state.workouts : state.workouts.filter(w => w.category === cat));
}

function selectWorkout(id) {
  state.selectedWorkout = state.workouts.find(w => w.id === id);
  const w = state.selectedWorkout;
  if (!w) return;
  document.getElementById('workout-placeholder').style.display = 'none';
  document.getElementById('workout-form').style.display = 'block';
  document.getElementById('workout-form-title').textContent = w.name;
  document.getElementById('workout-form-meta').textContent = w.type === 'duration' ? `${w.calories_per_minute} kcal per minute · ${w.category}` : `${w.calories_per_rep} kcal per rep · ${w.category}`;
  document.getElementById('workout-unit-label').textContent = w.type === 'duration' ? 'minutes' : 'reps';
  document.getElementById('workout-value').value = '';
  document.getElementById('est-cal-burn').textContent = '0';
  document.getElementById('workout-value').oninput = function() {
    const val = parseFloat(this.value) || 0;
    document.getElementById('est-cal-burn').textContent = w.type === 'duration' ? Math.round(val * w.calories_per_minute) : Math.round(val * w.calories_per_rep);
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
  if (!state.selectedWorkout) return;
  const value = parseFloat(document.getElementById('workout-value').value);
  if (!value || value <= 0) return showToast('Enter a valid value', 'error');
  const res = await fetch(`${API}/workout-logs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workout_id: state.selectedWorkout.id, value, date: todayStr() })
  });
  const data = await res.json();
  clearWorkoutForm();
  await loadWorkoutTab();
  showToast(`Workout logged! ${Math.round(data.calories_burned)} kcal burned`, 'success');
}

function renderWorkoutLogs(logs) {
  const el = document.getElementById('workout-today-list');
  if (logs.length === 0) { el.innerHTML = `<div class="empty-state">No workouts logged today</div>`; return; }
  el.innerHTML = logs.map(log => `
    <div class="workout-log-entry">
      <div class="workout-entry-info">
        <div class="workout-entry-name">${log.name}</div>
        <div class="workout-entry-detail">${log.type === 'duration' ? `${log.value} min` : `${log.value} reps`} · ${log.category}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="workout-entry-cal">${Math.round(log.calories_burned)} kcal</span>
        <button class="workout-entry-del" onclick="deleteWorkoutLog(${log.id})">✕</button>
      </div>
    </div>
  `).join('');
}

async function deleteWorkoutLog(id) {
  await fetch(`${API}/workout-logs/${id}`, { method: 'DELETE' });
  await loadWorkoutTab();
  showToast('Workout removed');
}

// ═══════════════════════════════════════════════════
//   SETTINGS
// ════════════════════════════════════════════════════
async function openSettings() {
  if (state.user) {
    document.getElementById('settings-height').value = state.user.height;
    document.getElementById('settings-neck').value = state.user.neck || '';
    document.getElementById('settings-waist').value = state.user.waist || '';
    document.getElementById('settings-age').value = state.user.age;
    document.getElementById('settings-gender').value = state.user.gender;
    document.getElementById('settings-calories').value = state.user.target_calories;
  }
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }

async function saveSettings() {
  await fetch(`${API}/user`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      height: parseFloat(document.getElementById('settings-height').value),
      neck: parseFloat(document.getElementById('settings-neck').value),
      waist: parseFloat(document.getElementById('settings-waist').value),
      age: parseInt(document.getElementById('settings-age').value),
      gender: document.getElementById('settings-gender').value,
      target_calories: parseInt(document.getElementById('settings-calories').value)
    })
  });
  const res = await fetch(`${API}/user`);
  state.user = await res.json();
  closeSettings();
  showToast('Settings saved!', 'success');
  await loadDashboard();
}

// ═══════════════════════════════════════════════════
//   UTILITIES
// ════════════════════════════════════════════════════
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

let toastTimer = null;
function showToast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

init();
