import json
import time
from fastapi import APIRouter, HTTPException

from ...common import resource_collection, resource_memo_collection, logger
from models.pydantic_models import ResourceMemo, ResourceMemoCreate, ResourceMemoUpdate
from google.api_core.exceptions import FailedPrecondition


router = APIRouter(prefix="/resources", tags=["resources"])


def _resource_memo_doc_to_model(doc) -> ResourceMemo:
    data = doc.to_dict()
    return ResourceMemo(
        id=doc.id,
        resource_id=data.get("resource_id"),
        content=data.get("content", ""),
        created_at=data.get("created_at", 0.0),
        updated_at=data.get("updated_at", 0.0),
    )


@router.post("/{resource_id}/memos", response_model=ResourceMemo)
async def create_resource_memo(resource_id: str, memo: ResourceMemoCreate):
    if not resource_collection().document(resource_id).get().exists:
        raise HTTPException(status_code=404, detail="社会資源が見つかりません")
    now = time.time()
    doc_ref = resource_memo_collection().document()
    data = {"resource_id": resource_id, "content": memo.content, "created_at": now, "updated_at": now}
    doc_ref.set(data)
    return _resource_memo_doc_to_model(doc_ref.get())


@router.get("/{resource_id}/memos", response_model=list[ResourceMemo])
async def list_resource_memos(resource_id: str):
    try:
        q = resource_memo_collection().where("resource_id", "==", resource_id).order_by("created_at")
        docs = q.stream()
        return [_resource_memo_doc_to_model(d) for d in docs]
    except FailedPrecondition as e:
        logger.warning(f"memo list: missing composite index, fallback to client sort ({e})")
        docs = resource_memo_collection().where("resource_id", "==", resource_id).stream()
        memos = [_resource_memo_doc_to_model(d) for d in docs]
        memos.sort(key=lambda m: m.created_at)
        return memos


@router.patch("/memos/{memo_id}", response_model=ResourceMemo)
async def update_resource_memo(memo_id: str, memo: ResourceMemoUpdate):
    doc_ref = resource_memo_collection().document(memo_id)
    snap = doc_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="メモが見つかりません")
    now = time.time()
    try:
        doc_ref.update({"content": memo.content, "updated_at": now})
        return _resource_memo_doc_to_model(doc_ref.get())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"資源メモ更新失敗: {e}")


@router.delete("/memos/{memo_id}")
async def delete_resource_memo(memo_id: str):
    doc_ref = resource_memo_collection().document(memo_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="メモが見つかりません")
    try:
        doc_ref.delete()
        return {"status": "deleted", "id": memo_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"資源メモ削除失敗: {e}")
