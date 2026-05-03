// Categories + colors for the academic dashboard.
// "subject" in life_dashboard's vocabulary == our "category_name".
// "context" → "place" (where the task is done).

const DIMENSIONS = {
  // The closed list of 9 — matches our backend models.CategoryName.
  subject: [
    "יסודות ההסתברות",
    "לינארית",
    "חדווא",
    "פייתון",
    "ערבית",
    "שער למחקר",
    "דת האסלאם",
    "תולדות העמים המוסלמים",
    "כללי",
  ],
  context: ["@home", "@university", "@library", "@cafe", "@anywhere"],
  // Binary — medium adds noise without information. User picks important/urgent or not.
  importance: ["low", "high"],
  urgency: ["low", "high"],
};

// Per-category color + Hebrew label. Mirrors seed.py.
const SUBJECT_META = {
  "יסודות ההסתברות": {
    color: "#047857", icon: "Book", label: "יסודות ההסתברות",
    bg: "#D1FAE5", mid: "#34D399",
  },
  "לינארית": {
    color: "#1D4ED8", icon: "Book", label: "לינארית",
    bg: "#DBEAFE", mid: "#60A5FA",
  },
  "חדווא": {
    color: "#B45309", icon: "Book", label: "חדווא",
    bg: "#FEF3C7", mid: "#F59E0B",
  },
  "פייתון": {
    color: "#6D28D9", icon: "Book", label: "פייתון",
    bg: "#EDE9FE", mid: "#A78BFA",
  },
  "ערבית": {
    color: "#BE185D", icon: "Book", label: "ערבית",
    bg: "#FCE7F3", mid: "#F472B6",
  },
  "שער למחקר": {
    color: "#334155", icon: "Book", label: "שער למחקר",
    bg: "#F1F5F9", mid: "#94A3B8",
  },
  "דת האסלאם": {
    color: "#C2410C", icon: "Book", label: "דת האסלאם",
    bg: "#FFEDD5", mid: "#FB923C",
  },
  "תולדות העמים המוסלמים": {
    color: "#BE123C", icon: "Book", label: "תולדות העמים המוסלמים",
    bg: "#FFE4E6", mid: "#FB7185",
  },
  "כללי": {
    color: "#6B7280", icon: "More", label: "כללי",
    bg: "#F3F4F6", mid: "#9CA3AF",
  },
};

const CONTEXT_META = {
  "@home":       { icon: "Home" },
  "@university": { icon: "MapPin" },
  "@library":    { icon: "Book" },
  "@cafe":       { icon: "MapPin" },
  "@anywhere":   { icon: "Globe" },
};

// "Now" anchor — the frontend uses real `new Date()` everywhere; this is a
// fallback for views that import NOW. Just keep it as actual current time.
const NOW = new Date();

const SEED_TASKS = [];  // App.jsx loads from backend

// AI suggestions are not implemented in this project (we focus on the
// closed-list classifier). Empty stubs so SuggestionsPanel doesn't crash.
const SUGG_DIMS = { new_values: [], new_dimensions: [] };
const SUGG_CONNS = { sessions: [], related: [] };

window.DIMENSIONS = DIMENSIONS;
window.SUBJECT_META = SUBJECT_META;
window.CONTEXT_META = CONTEXT_META;
window.NOW = NOW;
window.SEED_TASKS = SEED_TASKS;
window.SUGG_DIMS = SUGG_DIMS;
window.SUGG_CONNS = SUGG_CONNS;
