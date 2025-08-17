import os
from infra.firestore import get_firestore_client
from typing import List
from models.pydantic_models import (
    ActivityReportRequest,
    ResourceCreate,
    ResourceUpdate,
    Resource,
    ResourceMemoCreate,
    ResourceMemoUpdate,
    ResourceMemo,
    ResourceSuggestRequest,
    ResourceSuggestResponse,
    SuggestedResource,
)
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from agent.gemini import GeminiAgent
from pydantic import BaseModel
import time
import json
import hashlib
import random
import re
import math
import asyncio
from google.cloud import firestore  # GCP Firestore client (fallback 用)
from fastapi.middleware.cors import CORSMiddleware
from google.api_core.exceptions import NotFound as FirestoreNotFound, FailedPrecondition, PermissionDenied

# 階層保存用ターゲット (環境変数で上書き可能)
TARGET_APP_ID = os.getenv("TARGET_FIREBASE_APP_ID", "1:667712908416:web:ad84cae4853ac6de444a65")
TARGET_USER_ID = os.getenv("TARGET_FIREBASE_USER_ID", "firebase-adminsdk-fbsvc@tritama-e20cf.iam.gserviceaccount.com")


def _resource_collection():
    return (
        db.collection("artifacts")
        .document(TARGET_APP_ID)
        .collection("users")
        .document(TARGET_USER_ID)
        .collection("resources")
    )


def _resource_memo_collection():
    return (
        db.collection("artifacts")
        .document(TARGET_APP_ID)
        .collection("users")
        .document(TARGET_USER_ID)
        .collection("resource_memos")
    )


# AssessmentMappingRequestモデルの定義
class AssessmentMappingRequest(BaseModel):
    text_content: str
    assessment_items: list


# Firestoreクライアント初期化: Firebase Admin 経由 (FIREBASE_SERVICE_ACCOUNT) 優先 / なければ Application Default
def _init_firestore():
    try:
        # 優先: service account JSON を環境変数 (base64/raw JSON) で保持
        return get_firestore_client()
    except Exception as e:
        logger.warning(f"Firebase Admin 初期化失敗 / フォールバック (google.cloud.firestore.Client): {e}")
        try:
            project_id = (
                os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
            )
            if project_id:
                client = firestore.Client(project=project_id)
            else:
                client = firestore.Client()  # ADC 環境変数 / メタデータサーバ依存
            logger.info(f"Firestore Client 初期化 (project={client.project})")
            return client
        except Exception as inner:
            logger.error(f"Firestore 初期化に失敗しました: {inner}")
            raise


db = _init_firestore()

# .envファイルから環境変数を読み込む
load_dotenv()

# 環境変数からAPIキーを取得
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID")

# logging の設定 (LOG_LEVEL 環境変数で上書き可能: DEBUG / INFO / WARNING ...)
_log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, _log_level, logging.INFO))
logger = logging.getLogger(__name__)

# ---------------- In-memory embedding index (prototype) ----------------
EMBED_MODEL_NAME = os.getenv("EMBED_MODEL", "models/text-embedding-004")
_resource_embeddings: dict[str, list[float]] = {}


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1e-9
    nb = math.sqrt(sum(y * y for y in b)) or 1e-9
    return dot / (na * nb)


def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts returning list of float vectors.

    Supports current google-generativeai SDK (embed_content) and falls back gracefully
    if the SDK is missing / misconfigured.
    """
    if not texts:
        return []
    try:
        import google.generativeai as genai  # type: ignore

        if GEMINI_API_KEY:
            try:
                genai.configure(api_key=GEMINI_API_KEY)
            except Exception as ce:  # configuration errors
                logger.warning(f"genai configure failed: {ce}")
        vecs: list[list[float]] = []
        for t in texts:
            truncated = (t or "")[:8000]
            if not truncated.strip():
                vecs.append([])
                continue
            try:
                resp = genai.embed_content(model=EMBED_MODEL_NAME, content=truncated)
                # New SDK returns dict with 'embedding'; older could be object
                if isinstance(resp, dict):
                    emb = resp.get("embedding", [])
                else:
                    emb = getattr(resp, "embedding", [])
                if not isinstance(emb, list):
                    emb = []
                vecs.append(emb)
            except Exception as e:
                logger.warning(f"embedding failure: {e}")
                vecs.append([])
        return vecs
    except ImportError as ie:
        logger.error(f"Embedding API import error: {ie}")
    except Exception as e:
        logger.error(f"Embedding API error: {e}")
    # Fallback: return empty vectors preserving length
    return [[] for _ in texts]


def _resource_to_corpus(r: Resource) -> str:
    parts = [
        r.service_name or "",
        r.category or "",
        r.description or "",
        r.eligibility or "",
        r.application_process or "",
        r.target_users or "",
        " ".join(r.keywords or []),
    ]
    return "\n".join([p for p in parts if p])


def _ensure_resource_embeddings():
    if _resource_embeddings:
        return
    try:
        docs = _resource_collection().stream()
        resources: list[Resource] = []
        for d in docs:
            try:
                resources.append(_resource_doc_to_model(d))
            except ValueError:
                continue
        corpora = [_resource_to_corpus(r) for r in resources]
        vectors = _embed_texts(corpora)
        for r, v in zip(resources, vectors):
            if v:
                _resource_embeddings[r.id] = v
        logger.info(f"Embedded {len(_resource_embeddings)} resources for suggestions")
    except Exception as e:
        logger.error(f"Failed to build embeddings: {e}")


def _refresh_resource_embedding(resource_id: str):
    try:
        snap = _resource_collection().document(resource_id).get()
        if not snap.exists:
            _resource_embeddings.pop(resource_id, None)
            return
        r = _resource_doc_to_model(snap)
        vec = _embed_texts([_resource_to_corpus(r)])[0]
        if vec:
            _resource_embeddings[resource_id] = vec
    except Exception as e:
        logger.warning(f"refresh embedding failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # アプリケーション起動時に実行
    logger.info("アプリケーションを起動します...")
    if not GEMINI_API_KEY or not GOOGLE_CSE_ID:
        raise ValueError("APIキーまたはCSE IDが設定されていません。")

    # GeminiAgentを初期化してapp.stateに格納
    app.state.gemini_agent = GeminiAgent(api_key=GEMINI_API_KEY, google_cse_id=GOOGLE_CSE_ID)
    logger.info("GeminiAgentの初期化が完了しました。")
    yield
    # アプリケーション終了時に実行
    logger.info("アプリケーションをシャットダウンします...")


app = FastAPI(lifespan=lifespan)
# CORS設定（React/Next.jsからのリクエストを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境ではより厳密な設定を推奨
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Exponential Backoff Utility ---
def exponential_backoff(func, max_attempts=5, initial_delay=1, max_delay=16):
    """
    指定した関数を指数バックオフで再試行するユーティリティ関数。
    """
    delay = initial_delay
    for attempt in range(max_attempts):
        try:
            return func()
        except Exception as e:
            if attempt == max_attempts - 1:
                raise
            time.sleep(delay + random.uniform(0, 0.5))
            delay = min(delay * 2, max_delay)


# --- 活動報告書生成エンドポイント ---
@app.post("/reports/activity/")
async def generate_activity_report(req: ActivityReportRequest):
    # Geminiで活動報告書を生成
    def call_gemini():
        gemini_agent: GeminiAgent = app.state.gemini_agent
        return gemini_agent.generate_activity_report(req.case_name, req.memos, req.tasks)

    try:
        report = exponential_backoff(call_gemini)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")
    return {"report": report}


# --- アセスメント項目取得エンドポイント ---
@app.get("/assessment_items/")
async def get_assessment_items():
    """
    Firestoreからアセスメント項目を取得するエンドポイント。
    """
    try:
        # created_atでソートして取得
        items_ref = db.collection("assessment_items").order_by("created_at")
        docs = items_ref.stream()
        items = [{"id": doc.id, **doc.to_dict()} for doc in docs]
        return {"assessment_items": items}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"アセスメント項目の取得中にエラーが発生しました: {str(e)}",
        )


# --- アセスメントマッピングエンドポイント ---
@app.post("/assessment/map/")
async def map_assessment(req: AssessmentMappingRequest, request: Request):
    """
    面談記録を解析し、アセスメント項目にマッピングするエンドポイント。
    """
    gemini_agent: GeminiAgent = request.app.state.gemini_agent
    try:
        mapped_data = gemini_agent.map_to_assessment_items(req.text_content, req.assessment_items)
        return mapped_data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"アセスメントマッピング中にエラーが発生しました: {str(e)}",
        )


# SupportPlanRequestモデルの定義
class SupportPlanRequest(BaseModel):
    assessment_data: dict  # 必要に応じて型やフィールドを調整


# --- 支援計画生成エンドポイント ---
@app.post("/support-plan/generate/")
async def generate_support_plan(req: SupportPlanRequest, request: Request):
    """
    アセスメント情報を基に支援計画を生成するエンドポイント。
    """
    gemini_agent: GeminiAgent = request.app.state.gemini_agent
    try:
        plan = gemini_agent.generate_support_plan_with_agent(req.assessment_data)
        return {"plan": plan}
    except Exception as e:
        logger.error(f"支援計画の生成中にエラーが発生しました: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"支援計画の生成中にエラーが発生しました: {str(e)}",
        )


# --- 社会資源 CRUD エンドポイント ---


def _resource_doc_to_model(doc) -> Resource:
    data = doc.to_dict()

    def _coerce(v):
        if v is None:
            return None
        if isinstance(v, (str, int, float)):
            return str(v) if not isinstance(v, str) else v
        # dict / list -> JSON 文字列化
        try:
            import json as _json

            return _json.dumps(v, ensure_ascii=False)
        except Exception:
            return str(v)

    service_name_val = _coerce(data.get("service_name"))
    if not service_name_val:  # None or empty
        raise ValueError("missing service_name")
    return Resource(
        id=doc.id,
        service_name=service_name_val,
        category=_coerce(data.get("category")),
        target_users=_coerce(data.get("target_users")),
        description=_coerce(data.get("description")),
        eligibility=_coerce(data.get("eligibility")),
        application_process=_coerce(data.get("application_process")),
        cost=_coerce(data.get("cost")),
        provider=_coerce(data.get("provider")),
        location=_coerce(data.get("location")),
        contact_phone=_coerce(data.get("contact_phone")),
        contact_fax=_coerce(data.get("contact_fax")),
        contact_email=_coerce(data.get("contact_email")),
        contact_url=_coerce(data.get("contact_url")),
        keywords=data.get("keywords", []),
        last_verified_at=data.get("last_verified_at"),
    )


@app.post("/resources/", response_model=Resource)
async def create_resource(resource: ResourceCreate):
    try:
        doc_ref = _resource_collection().document()
        data = resource.dict()
        # Firestore 保存前に dict/list が誤って入った場合 JSON 文字列化
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
        _refresh_resource_embedding(created.id)
        return created
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"社会資源登録失敗: {e}")


@app.get("/resources/", response_model=List[Resource])
async def list_resources():
    try:
        docs = _resource_collection().stream()
        items = []
        skipped_invalid = 0
        for d in docs:
            try:
                items.append(_resource_doc_to_model(d))
            except ValueError:
                skipped_invalid += 1
        if skipped_invalid:
            # 返却ヘッダに入れてもよいが簡易に X-Skipped-Invalid をログ
            logger.warning(f"resources: skipped {skipped_invalid} docs missing service_name")
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"社会資源一覧取得失敗: {e}")


@app.get("/resources/search", response_model=List[Resource])
async def search_resources(q: str, limit: int = 100):
    """簡易全文検索 (小規模前提)。

    対象フィールド: service_name, category, description, provider, location, keywords, target_users, (関連メモ content)
    スペース区切りトークンは AND 条件 (全トークン含む) でマッチ。
    大文字小文字無視。limit で返却件数制限。

    メモ検索仕様: 同一ユーザ配下 resource_memos から resource_id ごとに content を連結し haystack に追加。
    規模が大きくなる場合はインデックス/キャッシュを検討。
    """
    tokens = [t.lower() for t in re.split(r"\s+", q.strip()) if t]
    if not tokens:
        return []
    try:
        # 先に全メモをまとめて取得し resource_id -> 連結文字列 (lower) を構築 (N+1防止)
        memo_map: dict[str, str] = {}
        try:
            memo_docs = _resource_memo_collection().stream()
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
                # スペース区切りで蓄積
                if prev:
                    memo_map[rid] = prev + " \n" + content.lower()
                else:
                    memo_map[rid] = content.lower()
        except Exception as me:
            logger.warning(f"memo aggregation failed: {me}")

        docs = _resource_collection().stream()
        results: list[Resource] = []
        skipped_invalid = 0
        for d in docs:
            if len(results) >= limit:
                break
            try:
                r = _resource_doc_to_model(d)
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
                memo_map.get(r.id, ""),  # 追加: メモ内容
            ]
            # lower 済みメモ以外を lower 化
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


@app.get("/resources/{resource_id}", response_model=Resource)
async def get_resource(resource_id: str):
    doc = _resource_collection().document(resource_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="社会資源が見つかりません")
    return _resource_doc_to_model(doc)


@app.patch("/resources/{resource_id}", response_model=Resource)
async def update_resource(resource_id: str, resource: ResourceUpdate):
    doc_ref = _resource_collection().document(resource_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="社会資源が見つかりません")
    update_data = {k: v for k, v in resource.dict(exclude_unset=True).items() if v is not None}
    # 自動で最終確認日時を更新したい場合のオプション（content以外の変更がある時）
    if update_data and "last_verified_at" not in update_data:
        update_data["last_verified_at"] = time.time()
    # Coerce complex types
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
        model = _resource_doc_to_model(updated)
        _refresh_resource_embedding(resource_id)
        return model
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"社会資源更新失敗: {e}")


@app.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str):
    doc_ref = _resource_collection().document(resource_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="社会資源が見つかりません")
    try:
        doc_ref.delete()
        _resource_embeddings.pop(resource_id, None)
        return {"status": "deleted", "id": resource_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"社会資源削除失敗: {e}")


def _candidate_local_resource_paths():
    return [
        os.path.join(os.path.dirname(__file__), "data", "local_resources.json"),
        os.path.join(os.getcwd(), "application", "data", "local_resources.json"),
        os.path.join(os.getcwd(), "data", "local_resources.json"),
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


def _normalize_resource(raw: dict) -> dict:
    contact = raw.get("contact_info") or {}
    return {
        "service_name": raw.get("service_name"),
        "category": raw.get("category"),
        "target_users": raw.get("target_users"),
        "description": raw.get("description"),
        "eligibility": raw.get("eligibility"),
        "application_process": raw.get("application_process"),
        "cost": raw.get("cost"),
        "provider": raw.get("provider"),
        "location": raw.get("location"),
        "contact_phone": contact.get("phone"),
        "contact_fax": contact.get("fax"),
        "contact_email": contact.get("email"),
        "contact_url": contact.get("url"),
        "keywords": raw.get("keywords", []),
    }


@app.post("/resources/import-local")
async def import_local_resources(overwrite: bool = False, dry_run: bool = False):
    """local_resources.json を Firestore に同期。

    Parameters:
      overwrite: 既存があれば上書き (False なら既存は skip)
      dry_run: 書き込みを行わず集計のみ実施

    ID 生成: md5(service_name.lower().strip()) で安定化
    追加機能:
      - missing_field_counts: 任意/推奨フィールドの欠損集計
      - skipped_invalid_service_name: service_name 欠落でスキップした件数
    """
    data, path = _load_local_resources_file()
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="local_resources.json のトップレベルが配列ではありません")
    created = 0
    updated = 0
    skipped = 0
    batch_errors = []
    skipped_invalid_service_name = 0
    # 欠損集計: service_name 以外の主要フィールド
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
            doc_ref = _resource_collection().document(doc_id)
            try:
                exists = doc_ref.get().exists
            except FirestoreNotFound:
                # DB 未作成
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Firestore データベースが未作成です。コンソールで 'Firestore データベースを作成' を実行し Native モードを選択してください。"
                    ),
                )
            norm = _normalize_resource(entry)
            # 欠損フィールド集計 (空文字または None)
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


# --- Resource Memo CRUD ---
def _resource_memo_doc_to_model(doc) -> ResourceMemo:
    data = doc.to_dict()
    return ResourceMemo(
        id=doc.id,
        resource_id=data.get("resource_id"),
        content=data.get("content", ""),
        created_at=data.get("created_at", 0.0),
        updated_at=data.get("updated_at", 0.0),
    )


@app.post("/resources/{resource_id}/memos", response_model=ResourceMemo)
async def create_resource_memo(resource_id: str, memo: ResourceMemoCreate):
    # Ensure resource exists
    if not _resource_collection().document(resource_id).get().exists:
        raise HTTPException(status_code=404, detail="社会資源が見つかりません")
    now = time.time()
    doc_ref = _resource_memo_collection().document()
    data = {"resource_id": resource_id, "content": memo.content, "created_at": now, "updated_at": now}
    doc_ref.set(data)
    return _resource_memo_doc_to_model(doc_ref.get())


@app.get("/resources/{resource_id}/memos", response_model=list[ResourceMemo])
async def list_resource_memos(resource_id: str):
    """指定資源のメモ一覧を作成日時昇順で返却。

    Firestore では (resource_id == X) + order_by(created_at) の組み合わせに
    コンポジットインデックスが必要になることがあるため、インデックス未作成時は
    例外 (FailedPrecondition) を捕捉し、order_by を外して全件取得後 Python 側でソートする。
    データ量が少ない前提のフォールバック。大量データではインデックス作成を推奨。
    """
    try:
        q = _resource_memo_collection().where("resource_id", "==", resource_id).order_by("created_at")
        docs = q.stream()
        return [_resource_memo_doc_to_model(d) for d in docs]
    except FailedPrecondition as e:
        logger.warning(f"memo list: missing composite index, fallback to client sort ({e})")
        docs = _resource_memo_collection().where("resource_id", "==", resource_id).stream()
        memos = [_resource_memo_doc_to_model(d) for d in docs]
        memos.sort(key=lambda m: m.created_at)
        return memos


@app.patch("/resources/memos/{memo_id}", response_model=ResourceMemo)
async def update_resource_memo(memo_id: str, memo: ResourceMemoUpdate):
    doc_ref = _resource_memo_collection().document(memo_id)
    snap = doc_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="メモが見つかりません")
    now = time.time()
    try:
        doc_ref.update({"content": memo.content, "updated_at": now})
        return _resource_memo_doc_to_model(doc_ref.get())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"資源メモ更新失敗: {e}")


@app.delete("/resources/memos/{memo_id}")
async def delete_resource_memo(memo_id: str):
    doc_ref = _resource_memo_collection().document(memo_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="メモが見つかりません")
    try:
        doc_ref.delete()
        return {"status": "deleted", "id": memo_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"資源メモ削除失敗: {e}")


# --- Advanced Suggestion Endpoints ---
@app.post("/resources/advanced/suggest", response_model=ResourceSuggestResponse)
async def suggest_resources(req: ResourceSuggestRequest, request: Request):
    _ensure_resource_embeddings()
    assessment = req.assessment_data.get("assessment") if isinstance(req.assessment_data, dict) else None
    texts: list[str] = []
    if isinstance(assessment, dict):
        for form_val in assessment.values():
            if isinstance(form_val, dict):
                for cat_val in form_val.values():
                    if isinstance(cat_val, str):
                        texts.append(cat_val)
                    elif isinstance(cat_val, dict):
                        for sub_val in cat_val.values():
                            if isinstance(sub_val, str):
                                texts.append(sub_val)
    base_text = "\n".join(texts)[:20000]
    summary_text = base_text
    used_summary = False
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(f"[suggest_debug] raw_text_len={len(base_text)} snippets={len(texts)}")
    if req.use_llm_summary and base_text:
        try:
            gemini_agent: GeminiAgent = request.app.state.gemini_agent
            summary_text = gemini_agent.summarize_for_resource_match(base_text)
            used_summary = True
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(
                    f"[suggest_debug] summarization used_summary={used_summary} summary_len={len(summary_text)}"
                )
        except Exception as e:
            logger.warning(f"summary failed fallback raw: {e}")
            summary_text = base_text
    tokens = [t.lower() for t in re.split(r"[\s、。,.；;:\n\r\t/()『』「」【】\[\]{}]+", summary_text) if len(t) > 1][
        :1000
    ]
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(f"[suggest_debug] token_count={len(tokens)} first_tokens={tokens[:15]}")
    q_vec = _embed_texts([summary_text])[0]
    scored: list[tuple[str, float, list[str], Resource]] = []
    debug_components: list[dict] = []
    try:
        docs = _resource_collection().stream()
        for d in docs:
            try:
                res = _resource_doc_to_model(d)
            except ValueError:
                continue
            overlap = list({kw.lower() for kw in (res.keywords or []) if kw.lower() in tokens})[:12]
            kw_score = len(overlap)
            emb = _resource_embeddings.get(res.id, [])
            emb_score = _cosine(q_vec, emb) if q_vec and emb else 0.0
            final = emb_score * 0.7 + kw_score * 0.3
            if final <= 0:
                continue
            scored.append((res.id, final, overlap, res))
            if logger.isEnabledFor(logging.DEBUG):
                if len(debug_components) < 50:  # limit to avoid log explosion
                    debug_components.append(
                        {
                            "id": res.id,
                            "name": res.service_name[:60],
                            "kw_overlap": overlap,
                            "kw_score": kw_score,
                            "emb_score": round(emb_score, 4),
                            "final": round(final, 4),
                        }
                    )
    except Exception as e:
        logger.error(f"suggest iteration failed: {e}")
    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[: req.top_k]
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(
            f"[suggest_debug] candidates_considered={len(scored)} returning={len(top)} used_summary={used_summary}"
        )
        # log top 10 component breakdown (already limited above)
        try:
            import json as _json

            logger.debug("[suggest_debug] score_components=" + _json.dumps(debug_components[:10], ensure_ascii=False))
        except Exception:
            pass
    return ResourceSuggestResponse(
        query_tokens=tokens[:100],
        resources=[
            SuggestedResource(
                resource_id=i,
                service_name=r.service_name,
                score=round(s, 4),
                matched_keywords=mk,
                excerpt=(r.description or "")[:180],
            )
            for i, s, mk, r in top
        ],
        used_summary=used_summary,
    )


# --- AI対話型支援計画エンドポイント ---
class InteractiveSupportPlanRequest(BaseModel):
    client_name: str
    assessment_data: dict
    message: str
    stream: bool = True
    chunk_size: int = 120


class InteractiveSupportPlanResponse(BaseModel):
    reply: str


@app.post("/interactive_support_plan", response_model=InteractiveSupportPlanResponse)
async def interactive_support_plan(req: InteractiveSupportPlanRequest):
    agent = app.state.gemini_agent
    stream = await agent.generate_interactive_support_plan_stream(
        client_name=req.client_name, assessment_data=req.assessment_data, message=req.message
    )
    return StreamingResponse(stream, media_type="text/event-stream")
