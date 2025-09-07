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


# --- Social Resource Management Models ---
class ResourceBase(BaseModel):
    service_name: str
    category: Optional[str] = None
    target_users: Optional[str] = None
    description: Optional[str] = None
    eligibility: Optional[str] = None
    application_process: Optional[str] = None
    cost: Optional[str] = None
    provider: Optional[str] = None
    location: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_fax: Optional[str] = None
    contact_email: Optional[str] = None
    contact_url: Optional[str] = None
    keywords: Optional[List[str]] = []
    last_verified_at: Optional[float] = None


class ResourceCreate(ResourceBase):
    pass


class ResourceUpdate(BaseModel):
    service_name: Optional[str] = None
    category: Optional[str] = None
    target_users: Optional[str] = None
    description: Optional[str] = None
    eligibility: Optional[str] = None
    application_process: Optional[str] = None
    cost: Optional[str] = None
    provider: Optional[str] = None
    location: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_fax: Optional[str] = None
    contact_email: Optional[str] = None
    contact_url: Optional[str] = None
    keywords: Optional[List[str]] = None
    last_verified_at: Optional[float] = None


class Resource(ResourceBase):
    id: str


# --- Advanced suggestion models ---
class ResourceSuggestRequest(BaseModel):
    assessment_data: Dict[str, Any]
    top_k: int = 8
    use_llm_summary: bool = True


class SuggestedResource(BaseModel):
    resource_id: str
    service_name: str
    score: float
    matched_keywords: List[str] = []
    excerpt: Optional[str] = None
    reasons: Optional[List[str]] = []


class ResourceSuggestResponse(BaseModel):
    query_tokens: List[str]
    resources: List[SuggestedResource]
    used_summary: bool


# --- Resource Memo Models ---
class ResourceMemoBase(BaseModel):
    resource_id: str
    content: str


class ResourceMemoCreate(ResourceMemoBase):
    pass


class ResourceMemoUpdate(BaseModel):
    content: str


class ResourceMemo(ResourceMemoBase):
    id: str
    created_at: float
    updated_at: float


# --- Client Resource Usage Models ---
class ClientResourceBase(BaseModel):
    client_name: str
    resource_id: str
    service_name: str
    status: str = "active"  # "active" or "ended"
    notes: Optional[str] = None


class ClientResourceCreate(BaseModel):
    """client_nameはURL pathから取得するためリクエストボディには含まない"""

    resource_id: str
    service_name: str
    status: str = "active"  # "active" or "ended"
    notes: Optional[str] = None


class ClientResourceUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None


class ClientResource(ClientResourceBase):
    id: str
    added_at: float
    added_by: str
