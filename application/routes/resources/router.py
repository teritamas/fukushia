import json
import time
import re
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.resource_extraction_agent import (
    extract_resource_from_url,
    SocialResource,
)
from ..common import logger, resource_collection, resource_memo_collection
from models.pydantic_models import Resource, ResourceCreate, ResourceUpdate
from .service import resource_doc_to_model


router = APIRouter(prefix="/resources", tags=["resources"])


@router.post("/", response_model=Resource)
async def create_resource(resource: ResourceCreate):
    try:
        doc_ref = resource_collection().document()
        data = resource.dict()
        for k in [
            "category",
            "target_users",
            "description",
            "eligibility",
            "application_process",
            "cost",
            "provider",
            "location",
            "contact_phone",
            "contact_fax",
            "contact_email",
            "contact_url",
        ]:
            v = data.get(k)
            if v is not None and not isinstance(v, str):
                try:
                    import json as _json

                    data[k] = _json.dumps(v, ensure_ascii=False)
                except Exception:
                    data[k] = str(v)
        if not data.get("last_verified_at"):
            data["last_verified_at"] = time.time()
        doc_ref.set(data)
        created = Resource(id=doc_ref.id, **data)
        return created
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"社会資源登録失敗: {e}")


@router.get("/", response_model=List[Resource])
async def list_resources():
    try:
        docs = resource_collection().stream()
        items = []
        skipped_invalid = 0
        for d in docs:
            try:
                items.append(resource_doc_to_model(d))
            except ValueError:
                skipped_invalid += 1
        if skipped_invalid:
            logger.warning(f"resources: skipped {skipped_invalid} docs missing service_name")
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"社会資源一覧取得失敗: {e}")


@router.get("/search", response_model=List[Resource])
async def search_resources(q: str, limit: int = 100):
    tokens = [t.lower() for t in re.split(r"\s+", q.strip()) if t]
    if not tokens:
        return []
    try:
        memo_map: dict[str, str] = {}
        try:
            memo_docs = resource_memo_collection().stream()
            for md in memo_docs:
                data = md.to_dict() or {}
                rid = data.get("resource_id")
                if not rid:
                    continue
                content = data.get("content") or ""
                if not isinstance(content, str):
                    try:
                        content = json.dumps(content, ensure_ascii=False)
                    except Exception:
                        content = str(content)
                prev = memo_map.get(rid, "")
                if prev:
                    memo_map[rid] = prev + " \n" + content.lower()
                else:
                    memo_map[rid] = content.lower()
        except Exception as me:
            logger.warning(f"memo aggregation failed: {me}")

        docs = resource_collection().stream()
        results: list[Resource] = []
        skipped_invalid = 0
        for d in docs:
            if len(results) >= limit:
                break
            try:
                r = resource_doc_to_model(d)
            except ValueError:
                skipped_invalid += 1
                continue
            haystack_parts = [
                r.service_name or "",
                r.category or "",
                r.description or "",
                r.provider or "",
                r.location or "",
                r.target_users or "",
                " ".join(r.keywords or []),
                memo_map.get(r.id, ""),
            ]
            haystack = " \n".join(
                [part.lower() if i < len(haystack_parts) - 1 else part for i, part in enumerate(haystack_parts)]
            )
            if all(tok in haystack for tok in tokens):
                results.append(r)
        if skipped_invalid:
            logger.warning(f"resources search: skipped {skipped_invalid} invalid docs")
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"社会資源検索失敗: {e}")


@router.get("/{resource_id}", response_model=Resource)
async def get_resource(resource_id: str):
    doc = resource_collection().document(resource_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="社会資源が見つかりません")
    return resource_doc_to_model(doc)


@router.patch("/{resource_id}", response_model=Resource)
async def update_resource(resource_id: str, resource: ResourceUpdate):
    doc_ref = resource_collection().document(resource_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="社会資源が見つかりません")
    update_data = {k: v for k, v in resource.dict(exclude_unset=True).items() if v is not None}
    if update_data and "last_verified_at" not in update_data:
        update_data["last_verified_at"] = time.time()
    for k, v in list(update_data.items()):
        if k in {
            "category",
            "target_users",
            "description",
            "eligibility",
            "application_process",
            "cost",
            "provider",
            "location",
            "contact_phone",
            "contact_fax",
            "contact_email",
            "contact_url",
        } and not isinstance(v, str):
            try:
                import json as _json

                update_data[k] = _json.dumps(v, ensure_ascii=False)
            except Exception:
                update_data[k] = str(v)
    try:
        doc_ref.update(update_data)
        updated = doc_ref.get()
        model = resource_doc_to_model(updated)
        return model
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"社会資源更新失敗: {e}")


@router.delete("/{resource_id}")
async def delete_resource(resource_id: str):
    doc_ref = resource_collection().document(resource_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="社会資源が見つかりません")
    try:
        doc_ref.delete()
        return {"status": "deleted", "id": resource_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"社会資源削除失敗: {e}")


class ExtractRequest(BaseModel):
    url: str


# Endpoint to extract social resource information from a URL
@router.post("/extract-from-url", response_model=SocialResource)
async def extract_from_url(request: ExtractRequest):
    try:
        resource = await extract_resource_from_url(request.url)
        return resource
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"URLからの情報抽出失敗: {e}")
