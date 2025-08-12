from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime


class Memo(BaseModel):
    case_name: str
    content: str
    created_at: Optional[float] = None
    updated_at: Optional[float] = None
    tags: Optional[List[str]] = []


class Task(BaseModel):
    description: str
    due_date_hint: Optional[str] = None


class Payment(BaseModel):
    date: str
    item: str
    amount: float
    type: str  # "入金" or "支出"


class MemoCreate(BaseModel):
    case_name: str
    content: str


class MemoResponse(BaseModel):
    id: str
    case_name: str
    content: str
    timestamp: datetime
    supporter_name: str
    tasks: List[Task] = []
    payments: List[Payment] = []
    related_info: List[str] = []


class ActivityReportRequest(BaseModel):
    case_name: str
    memos: List[Memo]
    tasks: List[Task]


class ActivityReportResponse(BaseModel):
    report_content: str


class AssessmentMappingRequest(BaseModel):
    text_content: str
    assessment_items: Dict[str, Any]


class SupportPlanRequest(BaseModel):
    assessment_data: Dict[str, Any]
