# Building Principles — Academic Dashboard

How we build, regardless of feature. These hold for every phase. Re-read at the start of each phase. Violations are technical debt to be flagged, not silently absorbed.

---

## 1. Modular architecture

**Each module owns one responsibility.** Mirroring life_dashboard:

- `db.py` — SQLite schema + connection only. No business logic.
- `classifier.py` — the ONE Gemini call (free text → ClassifiedTask). No DB access.
- `app.py` — FastAPI routes only. Imports `db` and `classifier`. No data transformation logic of its own.
- `seed.py` — one-time DB initialization. Reads from a Python dict (translated from `DATA_SEED.md`). Never imported by `app.py`.
- `frontend/src/` — React components, each with a single concern (CaptureBar, TaskCard, AllView, etc.). Like life_dashboard.

**Boundaries:**
- Frontend talks to backend ONLY via documented API. Never reaches into DB shape.
- DB shape can change without breaking the frontend, as long as Pydantic response models stay stable.
- Pydantic models ARE the API contract. They are the boundary.

**Test:** *"Can I rewrite this module without touching any other module?"* If no, the boundary is wrong.

---

## 2. Verification loops

Every phase ends with a re-runnable verification step. Defined in `BUILD_PLAN.md` per phase.

- Phase 0: `phase0_validate.py` — must pass ≥27/30 before Phase 1.
- Phase 1: `curl /healthz`, `curl /categories` — must return 200.
- Phase 2: count tasks per course, spot-check a few, verify dates align with `DATA_SEED.md`.
- Phase 3: post 5 free-text inputs via `/docs`, verify each gets a valid `ClassifiedTask` with category from the closed list.
- Phase 4: walk through ugly UI, capture/mark/edit a task, reload, verify persistence.
- Phase 5: same checks via polished UI; direction toggle works without flipping language.
- Phase 6: edit a category, change a course time, reload, verify persistence.

**Don't move to the next phase until the current verification passes.** If verification reveals the model is wrong, fix the model and re-verify — don't add patches on top.

---

## 3. Benchmarking / regression

After Phase 0 passes, save the 30 inputs + expected outputs to `tests/fixtures/classifier_30.json`. Any change to the prompt, model, or schema re-runs this script. **If accuracy drops, the change is rejected** until the prompt is fixed.

After Phase 2 seeds the DB, save the expected per-course task count to `tests/fixtures/seed_baseline.json`. Any schema or seeding change must produce the same counts (or have the change explicitly approved).

After Phase 4 ugly UI works, write a `tests/smoke.md` checklist (~10 manual steps). Run after every frontend change.

**Pattern:** baseline → change → re-run → diff. If unexpected diff, investigate before continuing.

---

## 4. Security

- **`.env` for secrets.** `GOOGLE_API_KEY` is the only secret for v1. `.env` is in `.gitignore`. Never paste keys in chat (the life_dashboard key was already leaked once).
- **Pydantic validation at every API boundary.** Don't trust client input. Don't trust Gemini output either — `Literal[...]` enforces shape but field semantics also need bounds (`Field(ge=1, le=5)` for importance/urgency).
- **Parameterized SQL.** Never f-string a value into a query. SQLite's `?` placeholders only.
- **CORS:** allow only `http://localhost:8000` origin in v1. The frontend is served from the same origin anyway, so this is defense-in-depth.
- **Bind to 127.0.0.1**, not 0.0.0.0. This app is single-user, local. No external listener.
- **Don't surface internal errors to the user.** A 500 with a stack trace = user confusion + leaked information. Log internally, return clean error messages externally.
- **Gitignore:** `.env`, `*.db`, `__pycache__`, `.venv`. Same as life_dashboard.
- **Rotate Gemini key before any sharing or production usage** (life_dashboard's HANDOFF flagged the same — applies here transitively if we copy that key).

---

## 5. Debugging — use agents, don't rabbit-hole

When something breaks and the cause isn't obvious within 5 minutes:

- **Spawn an Explore agent** to investigate. Give it a tight scope: "find why the classifier returns 'כללי' for every Hebrew input." Don't burn the main context on log-spelunking.
- **Open `/docs` first** when the UI looks wrong. Verify the backend in isolation before suspecting the frontend. (If the backend returns wrong data, fix backend. If backend returns right data, problem is in the frontend.)
- **Don't blame the LLM until a deterministic bug is ruled out.** Read the prompt the model received, byte-by-byte. Most "Gemini bugs" are date math, encoding, or a dropped field.
- **Save the last 10 Gemini calls** somewhere visible (a `debug_log` table or a file). When something feels wrong, you can compare today's call to a known-good call from yesterday.

---

## 6. Type safety

- Pydantic for **every** API request and response shape.
- `Literal[...]` for closed-list fields (the 9 categories, the 5 task types, the 5 places).
- DB rows returned as typed Pydantic models, not raw dicts. Catches schema drift early.
- Don't `Any`-type your way out of a problem. If the type is unclear, the design is unclear.

---

## 7. Single source of truth

- The 9 categories live in **the `categories` table**, period. Pydantic's `Literal[...]` is generated at startup from the DB (or, if hardcoded for simplicity, has a comment pointing to the DB and a startup check that fails loud if they diverge).
- Course schedules live in `course_schedule` — not duplicated as constants in `seed.py` (after seeding, `seed.py` is no longer the source).
- Semester start/end live in the `settings` table.
- The frontend reads categories via `GET /categories` — never hardcodes them.

If a value lives in two places, you will eventually update one and forget the other.

---

## 8. Idempotency

- `seed.py` drops and recreates tables. Safe to re-run. Warn before running if user-added adhoc tasks would be wiped.
- Gemini classifier with `temperature=0` — same input → same output. Reproducible bugs.
- Settings updates use upsert (`ON CONFLICT REPLACE`), not insert. Re-saving the same settings is a no-op.
- API endpoints that "create" should be safe to retry — POST `/tasks` with the same payload twice should not corrupt state.

---

## 9. Error handling — only at boundaries

- Validate at the boundary (incoming HTTP request, outgoing Gemini call, DB read/write).
- **Don't** add try/except around internal calls between trusted modules. They make bugs invisible.
- **Don't** validate data that just came out of a Pydantic-typed function — the validation already happened.
- Surface errors to the user with clean human-readable messages. Log the full traceback internally.

---

## 10. Dependency hygiene

- Pin versions in `requirements.txt`. Same as life_dashboard.
- Reuse life_dashboard's deps where possible — same FastAPI, uvicorn, google-genai, python-dotenv versions.
- Don't add a dep without checking if stdlib (or an existing dep) covers the use case.

---

## 11. Logging

- Print to stdout in dev (uvicorn shows it). Don't bother with a logging framework for v1.
- Log: each incoming request URL + payload, each Gemini call's prompt + response, each DB write that changes user-visible state.
- Don't log: secrets, full DB dumps, every read.
- Format: prefix with timestamp + module name. Easy to grep.

---

## 12. Frontend / backend boundary (per memory)

- **New data → backend.** A new field on tasks = backend change.
- **New arrangement → frontend.** A new view (Eisenhower, by-place, by-urgency) = frontend filter+group only. Backend doesn't grow a `?view=eisenhower` parameter.
- This rule alone prevents most accidental backend bloat. Re-read when tempted to add a `/tasks/eisenhower` endpoint.

---

## 13. Confirm stack at session start

Per memory feedback. At the start of a build session:
- Python version, FastAPI port, Gemini model name, frontend pattern (Babel-in-browser vs. anything else).
- Implicit constraints: "will there be a mobile client?" "does Amit run this from his phone?"
- If the plan says "recommended, not locked" — confirm before scaffolding.

---

## 14. Brief before phase, summary BEFORE commit

Per memory feedback. Before each phase: 2–3 sentence brief of what's being built and how. After each phase: summary of what changed, what was verified, what's pending. Never commit before Amit sees the summary.

---

## 15. What good looks like

After v1 ships, Amit should be able to say:
- "Add a 10th category" → done in Settings UI, no code change.
- "Change Probability lecture to Wednesdays" → done in Settings UI, future tasks regenerate when he clicks the regen button.
- "Add an export-to-CSV button" → frontend-only change, ~30 lines.
- "Make the Eisenhower view show overdue at the top" → frontend-only.
- "Switch Gemini model to a newer version" → 1-line change in `classifier.py`, regression test confirms ≥27/30 still passes.

If any of these requires a multi-file refactor, the architecture is wrong.
