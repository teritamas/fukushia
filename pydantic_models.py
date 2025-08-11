from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

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
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class ActivityReportResponse(BaseModel):
    report_content: str
