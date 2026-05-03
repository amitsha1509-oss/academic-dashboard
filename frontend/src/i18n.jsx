// Bilingual strings + helpers. Switch via window.LANG.
// Persist user choice in localStorage so refresh keeps the selection.

const STRINGS = {
  en: {
    // Brand & footer
    brand: "אקדמיה",
    counter: (open, done) => `${open} open · ${done} done`,
    tagline: "capture once · trust the system to remember",
    kbdCapture: "capture",
    kbdViews: "views",
    kbdSend: "send",

    // Capture bar
    placeholder1: "remind me to call mom tomorrow 6pm",
    placeholder2: "renew car insurance before friday",
    placeholder3: "submit reimbursement form, urgent",
    placeholder4: "lunch with maya next thursday at noon",
    placeholderHe1: "send dana good luck for her test tomorrow 9am",
    placeholderHe2: "fix the failing test in nucleus-ai/tasks",
    add: "add it",
    thinking: "thinking…",
    classifying: "figuring out what this is…",

    // Views
    viewAll: "All",
    viewSubject: "By Course",
    viewContext: "Context",
    viewEisenhower: "Eisenhower",
    viewCalendar: "Calendar",
    viewAgenda: "Agenda",
    viewCourses: "Courses",
    viewHistory: "History",

    // Empty state
    emptyTitle: "nothing here yet —",
    emptySubtitle: "go dump something. write whatever's rattling around. I'll figure out the dimensions.",
    tryThis: "try one of these:",

    // Eisenhower
    quadDoFirst: "Do First",
    quadDoFirstSub: "important · urgent",
    quadSchedule: "Schedule",
    quadScheduleSub: "important · not urgent",
    quadDelegate: "Delegate",
    quadDelegateSub: "not important · urgent",
    quadDontDo: "Don't Do",
    quadDontDoSub: "not important · not urgent",
    axisUrgent: "← urgent",
    axisNotUrgent: "not urgent →",
    empty: "— empty —",

    // Agenda buckets
    bucketOverdue: "Overdue",
    bucketToday: "Today",
    bucketTomorrow: "Tomorrow",
    bucketThisWeek: "This week",
    bucketLater: "Later",
    bucketNoDate: "No date",

    // Calendar
    today: "today",
    week: "Week",
    month: "Month",
    noTimePrefix: "tasks have no date — see Agenda view.",
    noTimeOne: "1 task has no date — see Agenda view.",

    // Side steps & card actions
    sideSteps: "side steps",
    markDone: "mark done",
    markOpen: "mark open",
    delete: "delete",
    confirmDelete: "delete?",

    // Edit dialog
    editTask: "edit task",
    subject: "subject",
    context: "context",
    importance: "importance",
    urgency: "urgency",
    cancel: "cancel",
    saveChanges: "save changes",
    levelLow: "low",
    levelMedium: "medium",
    levelHigh: "high",

    // Suggestions panel
    suggestionsTitle: "ask the AI",
    suggestNewDimensions: "Suggest new dimensions",
    suggestNewDimensionsSub: "find better ways to slice your tasks",
    suggestConnections: "Suggest connections",
    suggestConnectionsSub: "find sessions and related tasks",
    loadingSlow: "this takes 3–8 seconds — calling the model",

    // Group bars
    collapseAll: "collapse all",
    expandAll: "expand all",

    // Tweaks
    tweaksLanguage: "Language",
    tweaksLanguageEn: "English",
    tweaksLanguageHe: "עברית",
    tweaksDirection: "Direction",
    tweaksDirAuto: "Auto (follow language)",
    tweaksDirLtr: "Left → right",
    tweaksDirRtl: "Right → left",
    tweaksTheme: "Theme",
    tweaksMode: "Mode",
    tweaksLight: "Light",
    tweaksDark: "Dark",
    tweaksAccent: "Accent",
    tweaksLayout: "Layout",
    tweaksDensity: "Density",
    tweaksComfortable: "Comfortable",
    tweaksCompact: "Compact",
    tweaksAutoDelete: "Auto-delete done",
    tweaksAutoDeleteSub: "Tasks you check off vanish after a moment.",
    tweaksOn: "On",
    tweaksOff: "Off",
    tweaksAboutMe: "About me",
    tweaksAboutMeSub: "Personal hints for the AI when classifying your tasks. E.g. \"when I say alarm I mean my iPad\", \"all workouts are super important to me\", \"errands means anything outside the house including the car\".",
    tweaksAboutMePlaceholder: "Tell the AI a little about how you think about your tasks…",
    tweaksSave: "save",
    tweaksSaved: "saved",
    tweaksSaving: "saving…",

    // Subjects (translated labels)
    subj_projects: "projects",
    subj_money: "money",
    subj_university: "university",
    subj_friends: "friends",
    subj_errands: "errands",
    subj_health: "health",
    subj_other: "other",

    // Contexts
    ctx_phone: "phone",
    ctx_computer: "computer",
    ctx_errand: "errand",
    ctx_home: "home",
    ctx_anywhere: "anywhere",
  },

  he: {
    brand: "אקדמיה",
    counter: (open, done) => `${open} פתוחות · ${done} הושלמו`,
    tagline: "להשליך פעם אחת · לתת למערכת לזכור",
    kbdCapture: "הוספה",
    kbdViews: "תצוגות",
    kbdSend: "שלח",

    placeholder1: "להזכיר לי להתקשר לאמא מחר ב-6 בערב",
    placeholder2: "לחדש ביטוח רכב לפני יום שישי",
    placeholder3: "להגיש טופס החזר, דחוף",
    placeholder4: "ארוחת צהריים עם מאיה ביום חמישי בצהריים",
    placeholderHe1: "לשלוח לדנה בהצלחה למבחן מחר ב-9 בבוקר",
    placeholderHe2: "לתקן את הבדיקה הנכשלת ב-nucleus-ai/tasks",
    add: "הוסף",
    thinking: "חושב…",
    classifying: "מנסה להבין מה זה…",

    viewAll: "הכל",
    viewSubject: "לפי קורס",
    viewContext: "הקשר",
    viewEisenhower: "איזנהאואר",
    viewCalendar: "יומן",
    viewAgenda: "סדר יום",
    viewCourses: "🎯 קורסים",
    viewHistory: "📚 היסטוריה",

    emptyTitle: "עדיין אין כלום —",
    emptySubtitle: "תזרקי משהו. כתבי מה שמסתובב לך בראש. אני אבין את הממדים.",
    tryThis: "נסי אחד מאלה:",

    quadDoFirst: "לבצע מיד",
    quadDoFirstSub: "חשוב · דחוף",
    quadSchedule: "לתזמן",
    quadScheduleSub: "חשוב · לא דחוף",
    quadDelegate: "להאציל",
    quadDelegateSub: "לא חשוב · דחוף",
    quadDontDo: "לא לעשות",
    quadDontDoSub: "לא חשוב · לא דחוף",
    axisUrgent: "→ דחוף",
    axisNotUrgent: "לא דחוף ←",
    empty: "— ריק —",

    bucketOverdue: "באיחור",
    bucketToday: "היום",
    bucketTomorrow: "מחר",
    bucketThisWeek: "השבוע",
    bucketLater: "בהמשך",
    bucketNoDate: "ללא תאריך",

    today: "היום",
    week: "שבוע",
    month: "חודש",
    noTimePrefix: "משימות ללא תאריך — ראי תצוגת סדר יום.",
    noTimeOne: "משימה אחת ללא תאריך — ראי תצוגת סדר יום.",

    sideSteps: "צעדים נלווים",
    markDone: "סמן כהושלם",
    markOpen: "סמן כפתוח",
    delete: "מחק",
    confirmDelete: "למחוק?",

    editTask: "עריכת משימה",
    subject: "נושא",
    context: "הקשר",
    importance: "חשיבות",
    urgency: "דחיפות",
    cancel: "ביטול",
    saveChanges: "שמירה",
    levelLow: "נמוך",
    levelMedium: "בינוני",
    levelHigh: "גבוה",

    suggestionsTitle: "תשאלי את ה-AI",
    suggestNewDimensions: "הציעו ממדים חדשים",
    suggestNewDimensionsSub: "למצוא דרכים טובות יותר לחלק את המשימות",
    suggestConnections: "הציעו קשרים",
    suggestConnectionsSub: "למצוא סשנים ומשימות קשורות",
    loadingSlow: "לוקח 3–8 שניות — קוראים למודל",

    collapseAll: "צמצם הכל",
    expandAll: "הרחב הכל",

    tweaksLanguage: "שפה",
    tweaksLanguageEn: "English",
    tweaksLanguageHe: "עברית",
    tweaksDirection: "כיווניות",
    tweaksDirAuto: "אוטומטי (לפי השפה)",
    tweaksDirLtr: "שמאל ← ימין",
    tweaksDirRtl: "ימין → שמאל",
    tweaksTheme: "ערכת נושא",
    tweaksMode: "מצב",
    tweaksLight: "בהיר",
    tweaksDark: "כהה",
    tweaksAccent: "צבע הדגשה",
    tweaksLayout: "פריסה",
    tweaksDensity: "צפיפות",
    tweaksComfortable: "נוח",
    tweaksCompact: "צפוף",
    tweaksAutoDelete: "מחיקה אוטומטית של הושלמו",
    tweaksAutoDeleteSub: "משימות שמסומנות כהושלמו נעלמות לאחר רגע.",
    tweaksOn: "פעיל",
    tweaksOff: "כבוי",
    tweaksAboutMe: "עליי",
    tweaksAboutMeSub: "רמזים אישיים ל-AI כשהוא מסווג את המשימות שלי. למשל: \"כשאני אומר התראה אני מתכוון לאייפד\", \"כל אימון הוא חשוב מאוד עבורי\", \"סידורים זה כל מה שמחוץ לבית כולל ברכב\".",
    tweaksAboutMePlaceholder: "ספרי ל-AI קצת על איך את חושבת על המשימות שלך…",
    tweaksSave: "שמור",
    tweaksSaved: "נשמר",
    tweaksSaving: "שומר…",

    subj_projects: "פרויקטים",
    subj_money: "כסף",
    subj_university: "אוניברסיטה",
    subj_friends: "חברים",
    subj_errands: "סידורים",
    subj_health: "בריאות",
    subj_other: "אחר",

    ctx_phone: "טלפון",
    ctx_computer: "מחשב",
    ctx_errand: "בדרך",
    ctx_home: "בית",
    ctx_anywhere: "כל מקום",

    // EditDialog custom-value flow
    editCustomValueTitle: "ערך מותאם אישית",
    editAddCustomTitle: "הוספת ערך חדש",
    editNew: "חדש",
    editAdd: "הוסף",
    editNewPlaceholder: "ערך חדש",

    // Errors / global UI
    alertCreateFailed: "לא הצלחנו ליצור את המשימה",
    alertSaveFailed: "השמירה נכשלה",
    alertDeleteFailed: "המחיקה נכשלה",
    backendOfflineTitle: "השרת לא מגיב",
    backendOfflineBody: "המשימות המוצגות נטענו מקומית ולא יישמרו.",
    reload: "טעינה מחדש",
    tweaksTitle: "התאמות",
    manualEntryTitle: "הזנה ידנית — לעקוף את ה-AI",

    // Schedule view (new tab — pattern editor)
    viewSchedule: "🗓️ מערכת שעות",
    schAddPattern: "+ משימה חדשה",
    schAddPatternTitle: "משימה שבועית חדשה",
    schDelete: "מחיקה",
    schConfirmDelete: "למחוק את המשימה הזו? (לא ניתן לבטל)",
    schKindLabel: "סוג",
    schKindLecture: "הרצאה",
    schKindTutorial: "תרגול",
    schKindHw: "תרגיל בית",
    schKindReading: "קריאה",
    schDay: "יום",
    schStartTime: "שעת התחלה",
    schEndTime: "שעת סיום",
    schPatternLabel: "כותרת",
    schImportance: "חשיבות",
    schUrgency: "דחיפות",
    schImportant: "חשוב",
    schNotImportant: "לא חשוב",
    schUrgent: "דחוף",
    schNotUrgent: "לא דחוף",
    schNoOverride: "ברירת מחדל",
    schRequired: "חובה (לא נעלם בסוף היום)",
    schHwReleaseDay: "יום פרסום שיעורי בית",
    schHwReleaseTime: "שעת פרסום",
    schHwDueOffsetDays: "ימים עד הגשה",
    schHwDueTime: "שעת הגשה",
    schSaving: "שומר…",
    schSaved: "✓ נשמר",
    schEmpty: "אין משימות שבועיות לקורס הזה.",
    schSelectCategory: "קורס",
    schSelectKind: "סוג משימה",
    schDaySun: "ראשון",
    schDayMon: "שני",
    schDayTue: "שלישי",
    schDayWed: "רביעי",
    schDayThu: "חמישי",
    schDayFri: "שישי",
    schDaySat: "שבת",
    schDayUnset: "—",
    schSave: "שמור",
    schCancel: "ביטול",

    // Auth (session 4)
    loginTitle: "לוח בקרה אקדמי",
    loginSubtitle: "התחבר עם חשבון Google כדי להמשיך",
    loginButton: "התחבר עם Google",
    logout: "התנתק",
    welcomeNewUser: "ברוך הבא! עוד לא הוגדרו קורסים. גש ל-🎯 קורסים כדי להוסיף את הקורס הראשון שלך.",
    addCourseButton: "+ קורס חדש",
    addCourseTitle: "הוספת קורס חדש",
    addCourseName: "שם הקורס",
    addCourseColor: "צבע (hex 6 ספרות)",
    addCourseSave: "הוסף",
    addCourseCancel: "ביטול",
    coursesEmpty: "עוד אין לך קורסים. הוסף קורס חדש כדי להתחיל.",
    schEmptyNoCategories: "כדי להוסיף משימות שבועיות, צור קודם קורס בלשונית 🎯 קורסים.",
  },
};

// Hebrew-only app — language is fixed.
let _lang = "he";
try { localStorage.setItem("nucleus.lang", "he"); } catch {}
let _dir = "rtl";
try { localStorage.setItem("nucleus.dir", "rtl"); } catch {}
const _listeners = new Set();
const _dirListeners = new Set();

function _resolveDir() {
  // "auto" -> follow language; otherwise use the explicit override.
  if (_dir === "ltr" || _dir === "rtl") return _dir;
  return _lang === "he" ? "rtl" : "ltr";
}

function _applyDir() { document.documentElement.dir = _resolveDir(); }

function getLang() { return _lang; }
function setLang(_l) {
  // Hebrew-only — ignore the requested language. Force "he".
  _lang = "he";
  try { localStorage.setItem("nucleus.lang", _lang); } catch {}
  document.documentElement.lang = _lang;
  _applyDir();
  _listeners.forEach(fn => fn(_lang));
}
function getDir() { return _dir; }            // raw setting: "auto" | "ltr" | "rtl"
function getEffectiveDir() { return _resolveDir(); }  // resolved: "ltr" | "rtl"
function setDir(d) {
  _dir = (d === "ltr" || d === "rtl") ? d : "auto";
  try { localStorage.setItem("nucleus.dir", _dir); } catch {}
  _applyDir();
  _dirListeners.forEach(fn => fn(_dir));
}
function onLangChange(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }
function onDirChange(fn)  { _dirListeners.add(fn); return () => _dirListeners.delete(fn); }
function t(key, ...args) {
  const dict = STRINGS[_lang] || STRINGS.en;
  const v = dict[key] ?? STRINGS.en[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
}

// Hook
function useLang() {
  const [, force] = React.useState(0);
  React.useEffect(() => onLangChange(() => force(n => n + 1)), []);
  return { lang: _lang, t, setLang };
}

// initialize <html dir/lang>
document.documentElement.lang = _lang;
_applyDir();

window.STRINGS = STRINGS;
window.getLang = getLang;
window.setLang = setLang;
window.getDir = getDir;
window.setDir = setDir;
window.getEffectiveDir = getEffectiveDir;
window.onLangChange = onLangChange;
window.onDirChange = onDirChange;
window.t = t;
window.useLang = useLang;
