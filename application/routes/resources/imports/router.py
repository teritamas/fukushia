import hashlib
import json
import os
from fastapi import APIRouter, HTTPException
from google.api_core.exceptions import NotFound as FirestoreNotFound, FailedPrecondition, PermissionDenied

from ...common import resource_collection
from ..service import normalize_resource_input


router = APIRouter(prefix="/resources", tags=["resources"])


def _candidate_local_resource_paths():
    from pathlib import Path

    root = Path(__file__).resolve().parents[4]  # up to application/
    return [
        str(root / "data" / "local_resources.json"),
        str(root.parent / "application" / "data" / "local_resources.json"),
        str(root.parent / "data" / "local_resources.json"),
    ]


def _load_local_resources_file():
    for p in _candidate_local_resource_paths():
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f), p
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"ローカル資源ファイル読込失敗: {p}: {e}")
    raise HTTPException(status_code=404, detail="local_resources.json が見つかりませんでした")


@router.post("/import-local")
async def import_local_resources(overwrite: bool = False, dry_run: bool = False):
    data, path = _load_local_resources_file()
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="local_resources.json のトップレベルが配列ではありません")
    created = 0
    updated = 0
    skipped = 0
    batch_errors = []
    skipped_invalid_service_name = 0

    track_fields = [
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
    ]
    missing_field_counts = {f: 0 for f in track_fields}
    try:
        for entry in data:
            if not isinstance(entry, dict):
                batch_errors.append("非オブジェクト要素をスキップ")
                continue
            name = (entry.get("service_name") or "").strip()
            if not name:
                batch_errors.append("service_name 欠落要素をスキップ")
                skipped_invalid_service_name += 1
                continue
            doc_id = hashlib.md5(name.lower().encode()).hexdigest()
            doc_ref = resource_collection().document(doc_id)
            try:
                exists = doc_ref.get().exists
            except FirestoreNotFound:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Firestore データベースが未作成です。コンソールで 'Firestore データベースを作成' を実行し Native モードを選択してください。"
                    ),
                )
            norm = normalize_resource_input(entry)
            for f in track_fields:
                v = norm.get(f)
                if v is None or (isinstance(v, str) and v.strip() == ""):
                    missing_field_counts[f] += 1
            try:
                if exists and not overwrite:
                    skipped += 1
                    continue
                if exists and overwrite:
                    if not dry_run:
                        doc_ref.set(norm, merge=False)
                    updated += 1
                else:
                    if not dry_run:
                        doc_ref.set(norm)
                    created += 1
            except (FailedPrecondition, PermissionDenied) as e:
                raise HTTPException(status_code=403, detail=f"Firestore 権限/状態エラー: {e}")
            except Exception as e:
                batch_errors.append(f"{name}: {e}")
    except HTTPException:
        raise
    except FirestoreNotFound:
        raise HTTPException(
            status_code=503,
            detail="Firestore データベース (default) が存在しません。Cloud Console で作成後に再実行してください。",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"インポート中に想定外エラー: {e}")
    return {
        "source_path": path,
        "total_input": len(data),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": batch_errors,
        "overwrite": overwrite,
        "dry_run": dry_run,
        "missing_field_counts": missing_field_counts,
        "skipped_invalid_service_name": skipped_invalid_service_name,
    }
