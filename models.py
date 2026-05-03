"""
models.py — Pydantic shapes that ARE the API contract.

Per BUILDING_PRINCIPLES.md "Type safety": every endpoint's request and response
is a Pydantic model. These are the boundary between FastAPI / DB / classifier.

Multi-tenant note (session 4): the 9-category Literal that used to live here
was Amit-specific. Categories are now per-user, so the closed-list guarantee
is enforced at TWO points instead of one structural Literal:
  1. classifier.py builds the Gemini prompt with the user's category names
     listed explicitly.
  2. app.py validates the returned name against the user's `categories` rows.
"""
from datetime import datetime, date
from typing import Literal, Optional
from pydantic import BaseModel, Field, ConfigDict


TaskKind = Literal["lecture", "tutorial", "hw", "reading", "adhoc"]
TaskPlace = Literal["home", "university", "library", "cafe", "other"]
TaskStatus = Literal["open", "done", "skipped"]


# ─── Categories ──────────────────────────────────────────────────────
class Category(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    department: Optional[str] = None
    mandatory: bool = False
    color_dark: Optional[str] = None
    color_mid: Optional[str] = None
    color_light: Optional[str] = None
    sort_order: int = 0
    default_importance: Optional[int] = None
    default_urgency: Optional[int] = None
    self_confidence: Optional[Literal["excellent", "partial", "gap"]] = None
    gap_notes: Optional[str] = None


class CategoryCreate(BaseModel):
    """Body for POST /categories. Name required; everything else optional."""
    name: str = Field(min_length=1, max_length=80)
    department: Optional[str] = Field(default=None, max_length=80)
    mandatory: bool = False
    color_dark: Optional[str] = Field(default=None, pattern=r"^[0-9A-Fa-f]{6}$")
    color_mid: Optional[str] = Field(default=None, pattern=r"^[0-9A-Fa-f]{6}$")
    color_light: Optional[str] = Field(default=None, pattern=r"^[0-9A-Fa-f]{6}$")
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    department: Optional[str] = Field(default=None, max_length=80)
    mandatory: Optional[bool] = None
    color_dark: Optional[str] = Field(default=None, pattern=r"^[0-9A-Fa-f]{6}$")
    color_mid: Optional[str] = Field(default=None, pattern=r"^[0-9A-Fa-f]{6}$")
    color_light: Optional[str] = Field(default=None, pattern=r"^[0-9A-Fa-f]{6}$")
    sort_order: Optional[int] = None
    self_confidence: Optional[Literal["excellent", "partial", "gap"]] = None
    gap_notes: Optional[str] = None


PatternKind = Literal["lecture", "tutorial", "hw", "reading"]
DayOfWeek = Literal["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


# ─── Recurring patterns ──────────────────────────────────────────────
class RecurringPattern(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int
    category_name: Optional[str] = None  # joined for display
    kind: PatternKind
    day_of_week: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    hw_release_day: Optional[str] = None
    hw_release_time: Optional[str] = None
    hw_due_offset_days: Optional[int] = None
    hw_due_time: Optional[str] = None
    label: Optional[str] = None
    weeks_active: str = "[1,2,3,4,5,6,7,8,9,10,11,12,13]"
    is_required: bool = False
    default_importance: Optional[int] = Field(default=None, ge=1, le=5)
    default_urgency:    Optional[int] = Field(default=None, ge=1, le=5)


class PatternUpdate(BaseModel):
    """Fields editable via PATCH /patterns/{id}."""
    is_required: Optional[bool] = None
    label: Optional[str] = None
    day_of_week: Optional[DayOfWeek] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    hw_release_day: Optional[DayOfWeek] = None
    hw_release_time: Optional[str] = None
    hw_due_offset_days: Optional[int] = Field(default=None, ge=0, le=14)
    hw_due_time: Optional[str] = None
    default_importance: Optional[int] = Field(default=None, ge=1, le=5)
    default_urgency:    Optional[int] = Field(default=None, ge=1, le=5)


class PatternCreate(BaseModel):
    """Body for POST /patterns. category_id and kind required; everything else optional."""
    category_id: int
    kind: PatternKind
    label: Optional[str] = None
    day_of_week: Optional[DayOfWeek] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    hw_release_day: Optional[DayOfWeek] = None
    hw_release_time: Optional[str] = None
    hw_due_offset_days: Optional[int] = Field(default=None, ge=0, le=14)
    hw_due_time: Optional[str] = None
    is_required: bool = False
    default_importance: Optional[int] = Field(default=None, ge=1, le=5)
    default_urgency:    Optional[int] = Field(default=None, ge=1, le=5)


# ─── Tasks (virtual or adhoc) — unified API shape ────────────────────
class Task(BaseModel):
    """Unified shape returned by GET /tasks. Backend computes virtual instances
    from recurring_patterns and merges with adhoc_tasks rows."""
    id: str  # "r:{pattern_id}:{date}" or "a:{adhoc_id}"
    category_id: int
    category_name: str
    title: str
    type: TaskKind
    release_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    place: Optional[TaskPlace] = None
    importance: Optional[int] = None
    urgency: Optional[int] = None
    notes: Optional[str] = None
    status: TaskStatus = "open"
    source: Literal["recurring", "adhoc"]


class TaskUpdate(BaseModel):
    """PATCH /tasks/{id} payload."""
    status: Optional[TaskStatus] = None
    notes: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    place: Optional[TaskPlace] = None
    importance: Optional[int] = Field(default=None, ge=1, le=5)
    urgency: Optional[int] = Field(default=None, ge=1, le=5)


# ─── Free-text capture ───────────────────────────────────────────────
class CaptureRequest(BaseModel):
    text: str
    client_now: Optional[str] = None  # ISO datetime with offset, for date anchoring
    # User-provided overrides — when set, take precedence over AI/code defaults.
    importance: Optional[int] = Field(default=None, ge=1, le=5)
    urgency:    Optional[int] = Field(default=None, ge=1, le=5)
    due_at:     Optional[str] = None  # ISO datetime string; overrides AI-computed due


class ClassifiedTask(BaseModel):
    """Gemini's structured output. The closed-list guarantee on category_name
    is enforced at two layers, not at the Pydantic schema:
    1. The prompt lists the user's exact category names (classifier.py).
    2. app.py validates the returned name against the user's `categories` rows
       and falls back to the user's first category if Gemini hallucinated."""
    category_name: str = Field(min_length=1, max_length=80)
    title: str
    type: TaskKind = "adhoc"
    place: Optional[TaskPlace] = None
    importance: int = Field(ge=1, le=5)
    urgency: int = Field(ge=1, le=5)
    due_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    notes: Optional[str] = None
