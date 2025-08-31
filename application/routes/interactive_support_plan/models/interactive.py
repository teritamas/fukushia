from pydantic import BaseModel


class InteractiveSupportPlanRequest(BaseModel):
    client_name: str
    assessment_data: dict
    message: str
    stream: bool = True
    chunk_size: int = 120


class InteractiveSupportPlanResponse(BaseModel):
    reply: str

