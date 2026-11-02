from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class FormStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class QuestionType(str, Enum):
    SHORT_TEXT = "short_text"
    LONG_TEXT = "long_text"
    MULTIPLE_CHOICE = "multiple_choice"
    CHECKBOXES = "checkboxes"
    DROPDOWN = "dropdown"
    RATING = "rating"
    DATE = "date"
    FILE_UPLOAD = "file_upload"


class QuestionOption(BaseModel):
    id: str
    label: str
    value: str


class QuestionValidationRules(BaseModel):
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_selections: Optional[int] = None
    max_selections: Optional[int] = None
    regex_pattern: Optional[str] = None
    max_file_size_mb: Optional[int] = 10
    allowed_file_types: Optional[List[str]] = []


class QuestionBase(BaseModel):
    field_key: str
    question_type: QuestionType
    label: str
    description: Optional[str] = ""
    order_index: int = 0
    is_required: bool = False
    validation_rules: Optional[QuestionValidationRules] = Field(default_factory=QuestionValidationRules)
    options: Optional[List[QuestionOption]] = []


class QuestionCreate(QuestionBase):
    pass


class QuestionResponse(QuestionBase):
    id: str
    form_id: str
    created_at: datetime
    updated_at: datetime


class FormSettings(BaseModel):
    allow_multiple_responses: bool = True
    response_limit: Optional[int] = None
    confirmation_message: str = "Your response has been recorded."
    closing_date: Optional[datetime] = None


class FormTheme(BaseModel):
    primary_color: str = "#3B82F6"
    background_color: str = "#F8FAFC"
    font_family: str = "sans"
    header_image_url: Optional[str] = None


class FormBase(BaseModel):
    title: str = "Untitled Form"
    description: Optional[str] = ""
    status: FormStatus = FormStatus.DRAFT
    settings: Optional[FormSettings] = Field(default_factory=FormSettings)
    theme: Optional[FormTheme] = Field(default_factory=FormTheme)


class FormCreate(FormBase):
    shareable_slug: Optional[str] = None


class FormUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[FormStatus] = None
    settings: Optional[FormSettings] = None
    theme: Optional[FormTheme] = None


class FormResponse(FormBase):
    id: str
    creator_id: str
    shareable_slug: str
    response_count: int
    created_at: datetime
    updated_at: datetime
    questions: Optional[List[QuestionResponse]] = []
