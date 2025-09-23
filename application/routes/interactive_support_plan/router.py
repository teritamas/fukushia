from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .models.interactive import InteractiveSupportPlanRequest, InteractiveSupportPlanResponse


router = APIRouter(tags=["interactive"])


@router.post("/interactive_support_plan", response_model=InteractiveSupportPlanResponse)
async def interactive_support_plan(req: InteractiveSupportPlanRequest, request: Request):
    router_agent = request.app.state.router_agent
    route = await router_agent.route(req.message)

    if route.next_agent == "support_plan":
        support_plan_agent = request.app.state.support_plan_agent
        stream = await support_plan_agent.generate_interactive_support_plan_stream(
            client_name=req.client_name,
            assessment_data=req.assessment_data,
            message=req.message,
        )
    else:  # conversational
        conversational_agent = request.app.state.conversational_agent
        stream = await conversational_agent.generate_response_stream(
            client_name=req.client_name,
            assessment_data=req.assessment_data,
            message=req.message,
            chat_history=req.chat_history or [],
        )

    return StreamingResponse(stream, media_type="text/event-stream")
