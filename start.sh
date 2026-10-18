#!/usr/bin/env bash
# One-command start for the SOP Drafting Assistant demo (macOS / Linux).
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo ">> Created .env. Open it and paste your Gemini API key, then run this again."
  echo "   (Without a key the app runs in Demo mode with placeholder text.)"
fi

PY=python3
command -v $PY >/dev/null || { echo "Python 3 is required: https://www.python.org/downloads/"; exit 1; }

if [ ! -d .venv ]; then
  echo ">> First run: setting up (takes about a minute)…"
  $PY -m venv .venv
  ./.venv/bin/pip install -q --upgrade pip
  ./.venv/bin/pip install -q -r backend/requirements.txt
fi

# Rebuild the frontend only if Node is installed and the source changed (a prebuilt copy ships in frontend/dist).
if command -v npm >/dev/null && [ "${REBUILD_UI:-0}" = "1" ]; then
  (cd frontend && npm install --silent && npm run build)
fi

PORT="${PORT:-8000}"
echo ">> Opening http://localhost:$PORT  (press Ctrl+C here to stop)"
( sleep 2; open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null || true ) &
cd backend && ../.venv/bin/uvicorn app.main:app --port "$PORT"
