# Data Model

## Task shape

```ts
interface Task {
  id: number;                  // server-assigned
  raw_text: string;            // the user's original capture, unmodified
  subject: SubjectValue;       // see DIMENSIONS below
  context: ContextValue;       // "@phone" | "@computer" | "@errand" | "@home" | "@anywhere"
  importance: "low" | "medium" | "high";
  urgency: "low" | "medium" | "high";
  time_value: string | null;   // ISO 8601 datetime if the task has a specific moment, else null
  status: "open" | "done";
  created_at: string;          // ISO 8601, server-set
  next_steps: string[];        // 2-4 short actionable bullets, in user's language
  completed_steps: string[];   // subset of next_steps the user has checked off
}
```

## DIMENSIONS — the controlled vocabularies

These are the enums the classifier must pick from. The frontend imports these from `data.jsx`; in production they should come from `GET /api/dimensions` so the user can extend them.

```json
{
  "subject":    ["projects", "money", "university", "friends", "errands", "health", "other"],
  "context":    ["@phone", "@computer", "@errand", "@home", "@anywhere"],
  "importance": ["low", "medium", "high"],
  "urgency":    ["low", "medium", "high"]
}
```

### Subject — what is this task about
| Value | Meaning |
|---|---|
| `projects` | Work / side projects / anything output-oriented |
| `money` | Bills, taxes, insurance, banking, reimbursements |
| `university` | Coursework, study, exams, academic admin |
| `friends` | Social, relationships, family check-ins |
| `errands` | Shopping, pickups, anything physical-world transactional |
| `health` | Medical, fitness, sleep, mental health |
| `other` | Catchall — try to avoid |

### Context — where/how it gets done (David Allen style)
| Value | Meaning |
|---|---|
| `@phone` | Needs a call or text |
| `@computer` | Needs a laptop / browser |
| `@errand` | Needs leaving the house |
| `@home` | At home, no errand needed |
| `@anywhere` | No location/device constraint |

### Importance & Urgency — Eisenhower axes
Both `low` / `medium` / `high`. The Eisenhower view treats `high` importance as the top row and `high` urgency as the left column.

- **importance=high** → "do this even if no one's chasing you"
- **urgency=high** → "deadline today or this week"
- **urgency=medium** → "this month-ish"
- **urgency=low** → "no rush"

## Suggestions response shapes

### `POST /api/suggest/dimensions`
```ts
interface DimensionSuggestion {
  new_values: Array<{
    dimension: "subject" | "context" | "importance" | "urgency";
    value: string;                          // proposed new value, e.g. "@gym"
    reason: string;                         // why — should reference specific tasks
    example_task_ids: number[];             // 1-3 supporting task ids
  }>;
  new_dimensions: Array<{
    name: string;                           // snake_case, e.g. "energy_level"
    allowed_values: string[];               // proposed enum
    reason: string;
    example_task_ids: number[];
  }>;
}
```

### `POST /api/suggest/connections`
```ts
interface ConnectionSuggestion {
  sessions: Array<{
    task_ids: number[];                     // 2-4 tasks that batch well
    label: string;                          // short name for the batch
    estimated_minutes: number;
    reason: string;
  }>;
  related: Array<{
    task_ids: number[];                     // 2-3 tasks that are connected
    kind: string;                           // "depends-on" | "same-person" | "same-project" | etc
    reason: string;
  }>;
}
```

## Seed data
The prototype ships 14 seed tasks across all subjects/contexts/urgencies — see `src/data.jsx` `SEED_TASKS`. Use them for initial testing of your backend (POST them into your DB on first run, or keep them as fixtures). They include both English and Hebrew text so you can test bilingual classification.
