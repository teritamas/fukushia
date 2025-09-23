from pydantic import BaseModel
from typing import List, Optional


class ChatMessage(BaseModel):
    role: str
    content: str


class InteractiveSupportPlanRequest(BaseModel):
    client_name: str
    assessment_data: dict
    message: str
    stream: bool = True
    chunk_size: int = 120
    chat_history: Optional[List[ChatMessage]] = None


class InteractiveSupportPlanResponse(BaseModel):
    reply: str
