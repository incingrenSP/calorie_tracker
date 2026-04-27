# CALORIE TRACKER

A small project I made because MyFitnessPal is no longer supported on my device.

## Setup

```bash
# Install dependencies
npm install
npm install express
npm install cors
```

## Running the WebApp

```bash
# 1. Start the server
node server.js

# 2. Open in browser
open http://localhost:8000
```

OR 

```BASH
# 1. On Windows systems:
run.bat

# 2. On Linux/Mac systems:
run.sh
```

## Database Schema

```sql
-- User profile (single row)
CREATE TABLE user (
  id INTEGER PRIMARY KEY,
  height REAL,           -- cm
  initial_weight REAL,   -- kg
  neck REAL,             -- cm
  waist REAL,            -- cm
  age INTEGER,           -- years
  gender TEXT,           -- 'male' | 'female'
  target_calories INTEGER
);

-- Weekly weight tracking
CREATE TABLE weight_logs (
  id INTEGER PRIMARY KEY,
  date TEXT,             -- YYYY-MM-DD
  weight REAL            -- kg
);

-- Food library
CREATE TABLE food (
  id INTEGER PRIMARY KEY,
  name TEXT,
  calories_per_unit REAL,
  unit_label TEXT,       -- 'bowl', 'piece', 'serving'...
  category TEXT          -- 'breakfast'|'lunch'|'snack'|'dinner'
);

-- Daily food intake
CREATE TABLE daily_intake_logs (
  id INTEGER PRIMARY KEY,
  date TEXT,
  food_id INTEGER,
  quantity REAL          -- multiplier on calories_per_unit
  meal_category TEXT,
);

-- Workout library
CREATE TABLE workout (
  id INTEGER PRIMARY KEY,
  name TEXT,
  type TEXT,             -- 'duration' | 'reps'
  calories_per_minute REAL,
  calories_per_rep REAL,
  category TEXT          -- 'cardio'|'push'|'pull'|'leg'
);

-- Daily workout logs
CREATE TABLE workout_logs (
  id INTEGER PRIMARY KEY,
  date TEXT,
  workout_id INTEGER,
  value REAL,            -- minutes OR reps
  calories_burned REAL
);
```

## Key Calculations

```js
// BMI
BMI = weight_kg / (height_m ** 2)

// Body Fat %
BF% = 495 / (1.0324 - 0.19077 × log10(waist - neck) + 0.15456 × log10(height)) - 450

// Calories Remaining
remaining = (target_intake + calories_burned) - calories_consumed

// Calories burned by workout
if (type === 'duration') burned = calories_per_minute × minutes
if (type === 'reps')     burned = calories_per_rep × reps
```

## Database

- **9 food items** across breakfast, lunch, snacks, dinner
- **14 exercise types** (cardio, strength, flexibility)
- All foods and workouts can be expanded via the UI

## Features

- First-time setup modal (height, weight, neck, waist, age, gender, calorie target)
- Live clock dashboard, with cycling: Push, Pull, Leg, Break days
- Daily calorie summary (consumed vs burned vs remaining)
- Weekly weight chart (Chart.js line chart)
- Meal tabs: Breakfast, Lunch, Snacks, Dinner
- Block-style food cards with one-click logging
- Custom food servings entry per meal
- Workout logging (by duration or reps)
- BMI + body fat % calculations
- Settings editor (no re-setup needed)
- Persistent SQLite database (fittrack.db)
