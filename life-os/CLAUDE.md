# Notes for Claude

This is Amit's personal Life OS (Hebrew RTL). Before changing anything read `VISION.md`, `ARCHITECTURE.md`, `DECISIONS.md`.

Rules:
- Keep these three docs current in the same commit as the change. Don't create new planning/handoff files; add a line to `DECISIONS.md` instead.
- Before committing: `backend/.venv/bin/python -m pytest backend/tests` (or the Windows path), `cd frontend && npx tsc -p . --noEmit && npm test && npm run build`. Commit the rebuilt `frontend/dist`.
- New behavior for properties goes through `frontend/src/lib/fields.ts`, not special cases in pages.
- DB schema changes: append a migration in `backend/app/db.py`.
- UI text is Hebrew. Use logical CSS (start/end), never left/right.
- The user wants to see it work: run it and check in a browser before saying it's done.
