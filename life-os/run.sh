#!/usr/bin/env sh
# Starts Life OS (macOS / Linux). ./run.sh   — or ./run.sh --build to rebuild the frontend.
set -e
cd "$(dirname "$0")"
[ -d backend/.venv ] || python3 -m venv backend/.venv
backend/.venv/bin/pip install -q -r backend/requirements.txt
if [ "$1" = "--build" ] || [ ! -f frontend/dist/index.html ]; then (cd frontend && npm install && npm run build); fi
echo "Life OS: http://127.0.0.1:8765"
cd backend && exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
