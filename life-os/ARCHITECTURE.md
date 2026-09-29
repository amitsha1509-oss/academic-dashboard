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

Schema/data changes: append to `MIGRATIONS` in `db.py` (an SQL string or a Python function; never edit a shipped entry). `PRAGMA user_version` tracks what ran. Migration 2 removed emoji icons, added topic/project/note types, and dropped views that became built-in screens.

## Backend modules (backend/app)
- `db.py`: connection, migrations, first-run seed. No logic.
- `recurrence.py`: repeat rule → dates. Pure. Weeks start Sunday; weekday 0 = Sunday.
- `smart.py`: Today and Missed. Pure functions over item dicts.
- `models.py`: Pydantic request bodies (the write contract).
- `main.py`: routes. Soft-delete for items/properties/types; postpone counting; inbox auto-clears when a type or parent is set; property type conversion.
- `backup.py`: daily copy of the DB, keeps 14.

## Frontend (frontend/src)
- `lib/nav.tsx`: **screen-stack navigation**. `push({name, arg})` slides a screen in from the left (forward in RTL); back slides it out. Every back (our button, browser, phone gesture) goes through `history`/`popstate`, so they stay in sync. No sidebar, no URL routes: a reload returns to the main page.
- `lib/store.tsx`: loads everything once (`/api/bootstrap`); optimistic writes with rollback + error toast; refetches when the tab becomes visible.
- `lib/fields.ts`: **the field registry**. One description for every core and custom property (read, group, filter, set). Views, filters and bulk edits go through it, so a new property works everywhere automatically.
- `lib/viewEngine.ts`: filter/sort/group. Pure, unit-tested.
- `screens/`: `Home` (tiles), `Smart` (Today, Inbox, Missed, Tasks matrix), `Browse` (Topics, Studies, Timeline, Search, My views, Guide), `ItemScreen`, `ViewScreen` (list or matrix, all vertical), `Settings`.
- `components/kit.tsx`: `Screen` frame (back pill + big title), `Row` (the one item row used everywhere), `TypeLabel`, `Chip`, `QuickAdd`. `components/FieldEditor.tsx`: one editor per property kind. `components/ui.tsx`: popovers, menus, toasts, buttons.
- Style (direction C, "bright and bold"): tokens in `index.css` (light + dark), Heebo 800 for headings (`.display`), IBM Plex Sans Hebrew for text, both bundled. Types are shown as a colored dot + name (`--dot-<color>`), never emoji. Use logical classes (`ms-`, `ps-`, `start-`), never left/right. Content flows top to bottom; nothing scrolls sideways.

## Tests
- `backend/tests`: recurrence rules, API behaviors (inbox, postpone, snooze, missed, cycles, option removal, type conversion, delete/restore).
- `frontend/src/lib/viewEngine.test.ts`: filters, sort, grouping.
