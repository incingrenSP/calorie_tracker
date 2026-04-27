#!/bin/bash
echo "Starting CalorieTracker..."
sleep 1 && open http://localhost:8000 &
node server.js
