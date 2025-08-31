from fastapi import APIRouter, HTTPException, Request
from ...common import exponential_backoff
from models.pydantic_models import ActivityReportRequest


router = APIRouter(prefix="/reports/activity", tags=["reports"])


@router.post("/")
async def generate_activity_report(req: ActivityReportRequest, request: Request):
    def call_gemini():
        gemini_agent = request.app.state.gemini_agent
        return gemini_agent.generate_activity_report(req.case_name, req.memos, req.tasks)

    try:
        report = exponential_backoff(call_gemini)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")
    return {"report": report}
