from fastapi import APIRouter, HTTPException
from ...common import db


router = APIRouter(prefix="/assessment_items", tags=["assessment"])


@router.get("/")
async def get_assessment_items():
    try:
        items_ref = db.collection("assessment_items").order_by("created_at")
        docs = items_ref.stream()
        items = [{"id": doc.id, **doc.to_dict()} for doc in docs]
        return {"assessment_items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"アセスメント項目の取得中にエラーが発生しました: {str(e)}")
