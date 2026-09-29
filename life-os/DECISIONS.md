# Decisions

Newest at the bottom. One line of why for each.

- **2026-09-27 · Items + properties + views, not courses.** The last app was built around semesters and broke when life changed to exam period. Generic items survive any change.
- **2026-09-27 · A small set of core properties the app understands; everything else is user-defined.** Automation (missed, snooze, today) needs known fields; flexibility needs the rest.
- **2026-09-27 · A course is an item, linked through "part of".** It has its own properties (lecturer, links, exam date), which a property value can't hold.
- **2026-09-27 · Repeats are one rule + per-date marks.** No copies to maintain; changing a schedule is one edit.
- **2026-09-27 · Python/FastAPI + SQLite backend.** Already familiar, one data file, easy to back up, easy to host later.
- **2026-09-27 · React + TypeScript + Tailwind frontend; views computed in the browser.** Personal data volume is small; client-side filtering keeps the backend thin and views instant.
- **2026-09-27 · Built `frontend/dist` is committed.** Running the app needs only Python, not Node.
- **2026-09-27 · Deletes are soft (archive).** Undo everywhere; values survive hiding a property.
- **2026-09-27 · Local only for now, bound to 127.0.0.1, no login.** Single user on own computer. Hosting and auth come together later.
- **2026-09-27 · Hebrew RTL, Notion-like style, Heebo font bundled.** Works offline, no external requests.
- **2026-09-29 · Main page with tiles + sliding screens, no sidebar.** Asked for directly: one place to start, screens that slide right-to-left, everything flowing top to bottom.
- **2026-09-29 · Visual direction C ("bright and bold").** Chosen from three mockups: big black Heebo headings, one strong blue for "the next thing", gray tiles, no emoji, no decoration.
- **2026-09-29 · Built-in screens for Tasks, Topics, Studies and Timeline; views are the user's extras.** Each screen shows only the item types it's for (the tasks matrix never shows courses or lectures).
- **2026-09-29 · Board and table layouts removed.** They scrolled sideways; lists and a vertical matrix cover the same needs.
- **2026-09-29 · Design is agreed on a clickable prototype before building.** The first version was built before any design was shown, and looked generic.
