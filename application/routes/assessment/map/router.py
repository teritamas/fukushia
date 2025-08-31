from fastapi import APIRouter, HTTPException, Request
from models.pydantic_models import AssessmentMappingRequest


router = APIRouter(prefix="/assessment", tags=["assessment"])


@router.post("/map/")
async def map_assessment(req: AssessmentMappingRequest, request: Request):
    gemini_agent = request.app.state.gemini_agent
    try:
        mapped_data = gemini_agent.map_to_assessment_items(req.text_content, req.assessment_items)
        return mapped_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"アセスメントマッピング中にエラーが発生しました: {str(e)}")
