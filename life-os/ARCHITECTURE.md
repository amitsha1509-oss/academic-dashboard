# Architecture

## Shape
```
Browser (React, Hebrew RTL)  ──HTTP /api──▶  FastAPI (Python)  ──▶  SQLite file (data/lifeos.sqlite3)
        │                                        │
        │ all items in memory,                   │ repeat rules → occurrences,
        │ views computed client-side             │ Today / Missed computed server-side
```
One process on 127.0.0.1:8765 serves both the API and the built frontend (`frontend/dist`).

## Data model (backend/app/db.py)
| Table | Holds |
|---|---|
| `items` | Everything. Core columns the app understands (title, notes, status, type_id, parent_id, inbox, when_at/when_end, due_at, span_start/span_end, snooze_until, repeat JSON, links JSON, postpone_count) + `props` JSON for user-defined properties (`{property_id: value}`); an item stores only the properties it has |
| `property_defs` | User-defined properties: name, type (text/number/date/choice/multi/checkbox/url), options for choices. Deleting = archive (values kept) |
| `types` | Item types (task, course, lecture…): name, icon, color, suggested fields. Suggestions only, never enforced |
| `occurrences` | Per-date marks (done/skipped) for repeating items. Unmarked = open |
| `views` | Saved view configs (JSON: filters, groupBy, sort, layout, grid axes, columns) |

Schema changes: append to `MIGRATIONS` in `db.py` (never edit a shipped entry). `PRAGMA user_version` tracks what ran.

## Backend modules (backend/app)
- `db.py`: connection, migrations, first-run seed. No logic.
- `recurrence.py`: repeat rule → dates. Pure. Weeks start Sunday; weekday 0 = Sunday.
- `smart.py`: Today and Missed. Pure functions over item dicts.
- `models.py`: Pydantic request bodies (the write contract).
- `main.py`: routes. Soft-delete for items/properties/types; postpone counting; inbox auto-clears when a type or parent is set; property type conversion.
- `backup.py`: daily copy of the DB, keeps 14.

## Frontend (frontend/src)
- `lib/store.tsx`: loads everything once (`/api/bootstrap`); optimistic writes with rollback + error toast; refetches when the tab becomes visible.
- `lib/fields.ts`: **the field registry**. One description for every core and custom property (how to read it, group it, filter it, set it). Views, filters, board columns, grid axes and bulk edit all go through it, so a new property works everywhere automatically.
- `lib/viewEngine.ts`: filter/sort/group. Pure, unit-tested.
- `pages/`: Today, Inbox, Missed, Week (SmartPages), Item page, View page (toolbar + bulk edit), Timeline/Search, Settings.
- `layouts/Layouts.tsx`: list, board (drag between columns sets the property), table, grid (drag between cells sets both axes).
- `components/FieldEditor.tsx`: one editor per field kind.
- Styling: Tailwind with design tokens in `index.css` (light + dark). Use logical classes (`ms-`, `ps-`, `start-`), never `left`/`right`, so RTL stays correct.

## Tests
- `backend/tests`: recurrence rules, API behaviors (inbox, postpone, snooze, missed, cycles, option removal, type conversion, delete/restore).
- `frontend/src/lib/viewEngine.test.ts`: filters, sort, grouping.
