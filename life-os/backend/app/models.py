"""Request bodies. These are the API contract for writes."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

DATE = r"^\d{4}-\d{2}-\d{2}$"
DATETIME = r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$"
TIME = r"^\d{2}:\d{2}$"

Status = Literal["open", "done", "dropped"]
PropType = Literal["text", "number", "date", "choice", "multi", "checkbox", "url"]


class Repeat(BaseModel):
    freq: Literal["daily", "weekly", "monthly"] = "weekly"
    interval: int = Field(default=1, ge=1, le=52)
    weekdays: list[int] = Field(default_factory=list)
    start: str = Field(pattern=DATE)
    until: Optional[str] = Field(default=None, pattern=DATE)
    time: Optional[str] = Field(default=None, pattern=TIME)
    end_time: Optional[str] = Field(default=None, pattern=TIME)
    track_missed: bool = True


class Link(BaseModel):
    title: str = Field(default="", max_length=200)
    url: str = Field(min_length=1, max_length=2000)


class ItemFields(BaseModel):
    notes: Optional[str] = None
    type_id: Optional[str] = None
    parent_id: Optional[str] = None
    status: Optional[Status] = None
    inbox: Optional[bool] = None
    when_at: Optional[str] = Field(default=None, pattern=DATETIME)
    when_end: Optional[str] = Field(default=None, pattern=DATETIME)
    due_at: Optional[str] = Field(default=None, pattern=DATETIME)
    span_start: Optional[str] = Field(default=None, pattern=DATE)
    span_end: Optional[str] = Field(default=None, pattern=DATE)
    snooze_until: Optional[str] = Field(default=None, pattern=DATE)
    repeat: Optional[Repeat] = None
    links: Optional[list[Link]] = None
    props: Optional[dict[str, Any]] = None


class ItemCreate(ItemFields):
    title: str = Field(min_length=1, max_length=500)


class ItemPatch(ItemFields):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)


class BulkPatch(BaseModel):
    ids: list[str] = Field(min_length=1)
    patch: ItemPatch


class OccurrenceMark(BaseModel):
    status: Optional[Literal["done", "skipped"]] = None  # None clears the mark


class ChoiceOption(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=80)
    color: str = "gray"


class PropertyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: PropType
    options: list[ChoiceOption] = Field(default_factory=list)


class PropertyPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    options: Optional[list[ChoiceOption]] = None
    sort: Optional[int] = None


class PropertyConvert(BaseModel):
    type: PropType


class TypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon: str = Field(default="", max_length=8)
    color: str = "gray"
    suggested: list[str] = Field(default_factory=list)


class TypePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    icon: Optional[str] = Field(default=None, max_length=8)
    color: Optional[str] = None
    suggested: Optional[list[str]] = None
    sort: Optional[int] = None


class ViewCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon: str = Field(default="", max_length=8)
    config: dict[str, Any] = Field(default_factory=dict)


class ViewPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    icon: Optional[str] = Field(default=None, max_length=8)
    config: Optional[dict[str, Any]] = None
    sort: Optional[int] = None


class SettingValue(BaseModel):
    value: Any
