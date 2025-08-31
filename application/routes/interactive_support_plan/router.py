from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .models.interactive import InteractiveSupportPlanRequest, InteractiveSupportPlanResponse


router = APIRouter(tags=["interactive"])


@router.post("/interactive_support_plan", response_model=InteractiveSupportPlanResponse)
async def interactive_support_plan(req: InteractiveSupportPlanRequest, request: Request):
    agent = request.app.state.gemini_agent
    stream = await agent.generate_interactive_support_plan_stream(
        client_name=req.client_name, assessment_data=req.assessment_data, message=req.message
    )
    return StreamingResponse(stream, media_type="text/event-stream")
