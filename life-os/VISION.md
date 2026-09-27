# Life OS — Vision (brainstorm summary, 2026-09-27)

A personal app to organize my whole life (studies at Tel Aviv University, year 2, plus everything else).
Built for me only. Used mostly from my iPhone, also from my laptop.

## The problem
- Every tool I use (calendar, notes, …) shows one angle only, can't mix different kinds of information, and is hard to adapt.
- My biggest pain is **remembering**: lectures I missed and need to watch, tasks I postponed, calls and messages I owe, where I put things (e.g. my Drive folders).
- I have to update everything by hand.
- The previous project (academic-dashboard) was built around "semester → courses → weekly lectures". When my life changed to exam studying, it became useless. It also looked bad, had bugs, and its code and docs were messy.

## Goal
Open it and within seconds know **everything I need to do today** and **every long-term thing I have going on**: micro and macro in one place.

## Core idea: items + properties + views
- **Items** are anything: task, event, course, lecture, exam, idea, person, link.
- **Properties:** each item stores only the properties it has. Most items have just a few.
  - Adding, removing or renaming a property takes seconds inside the app, including on existing items (bulk edit).
  - No code change or database migration is needed.
  - Deleting a property archives it, so it's restorable.
- **Types** (Course, Lecture, Task, …) are only suggested sets of properties. Nothing is enforced, and an item's type can change later.
- **Relationships:** an item can be "part of" another item (a lecture is part of a course, a subtask is part of a project).
  A course is an **item**, not a property, because it has its own properties (lecturer, exam date, Drive link).
- **Core properties the app understands** (all optional per item):
  title, notes, status (open / done / dropped), when, due, span, snooze until, repeat, part of, importance, urgency, effort (easy / hard), tags, links.
  The app automates only around these; custom properties are for filtering and display.

## Time and repeating
- Time is a property: when / due / span / snooze until.
- Repeating things are **one rule**, e.g. "every Tue 10:00 from 26 Oct to 20 Jan". Individual occurrences are generated from the rule. Changes to one occurrence are saved for that date only.
- Switching life mode (semester → exams) means ending one rule and adding another. Nothing breaks, and history stays.

## Views (saved inside the app, not code)
- **Today:** scheduled items, things due soon, snoozed items that came back.
- **Inbox:** one-line quick captures from the phone. Sorted later, or left with missing properties.
- **Missed & postponed:** past lectures not watched, overdue tasks, tasks pushed several times, calls and messages to make.
- **Item page:** any item plus everything "part of" it, with progress (e.g. course → lectures, tasks, exam, Drive links).
- **Group by any property:** as a list, board or table.
- **Grid (Eisenhower):** any two properties as axes (importance × urgency by default). Items missing a value sit in an "unsorted" tray.
- **Long-term timeline:** courses, exam periods, projects.
- **Ideas:** browse and explore old ideas.
- Views can filter on "has / doesn't have" a property, which catches things I've missed.

## Self-maintaining (automatic, no manual updating)
- Missed occurrences surface on their own.
- Snoozed items return on their date.
- Tasks postponed repeatedly get flagged.
- The next exam is always visible.

## Capture
One line typed on the phone → goes to Inbox. Sorting and properties come later.

## Platform
- **PWA:** a website installed to the iPhone home screen. Full-screen, works offline, notifications.
- One codebase for phone and laptop.
- Hosted online, **not** on my PC and not on a trial that expires.
- Built and tested locally with Claude Code on my PC.

## Quality rules (lessons from the last project)
- Design first: a small design system (one font, few colors, consistent spacing, proven components). Must look clean and professional, not "AI-made".
- Boring, reliable tech, automated tests, automatic backups. It should run for months without me fixing it.
- Docs: only `VISION.md`, `ARCHITECTURE.md` and a short `DECISIONS.md` log, always kept up to date. No pile of contradictory plan files.

## Decided (2026-09-27)
- UI language: **Hebrew, RTL**.
- Runs **locally on my computer** for now; hosting comes later.
- Visual style: **Notion / Obsidian**: clean, calm, professional, easy to use.
- Name for now: **המרכז** ("the center"). Easy to rename.

## Still open
- Hosting and phone access (later).
- Notifications (later, after hosting).
- Import from Google Calendar / Moodle (later).
