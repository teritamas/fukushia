from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google.cloud.firestore import SERVER_TIMESTAMP
from ..common import db, logger, exponential_backoff
from models.pydantic_models import ClientResource, ClientResourceCreate, ClientResourceUpdate
import config
import time
from google.cloud.firestore_v1.base_query import FieldFilter


router = APIRouter(prefix="/clients", tags=["clients"])


class ClientCreateRequest(BaseModel):
    name: str


class ClientResponse(BaseModel):
    id: str
    name: str
    createdAt: datetime


class Suggestion(BaseModel):
    suggested_tasks: List[str]
    suggested_memo: str


def clients_collection():
    """クライアントコレクションへの参照を取得"""
    return (
        db.collection("artifacts")
        .document(config.TARGET_FIREBASE_APP_ID)
        .collection("users")
        .document(config.TARGET_FIREBASE_USER_ID)
        .collection("clients")
    )


def client_resources_collection():
    """クライアントリソースコレクションへの参照を取得"""
    return (
        db.collection("artifacts")
        .document(config.TARGET_FIREBASE_APP_ID)
        .collection("users")
        .document(config.TARGET_FIREBASE_USER_ID)
        .collection("client_resources")
    )


@router.get("/", response_model=List[ClientResponse])
async def get_clients():
    """クライアント一覧を取得"""
    try:

        def fetch_clients():
            ref = clients_collection()
            query = ref.order_by("createdAt", direction="ASCENDING")
            return query.stream()

        docs = exponential_backoff(fetch_clients)

        clients = []
        for doc in docs:
            data = doc.to_dict()
            if data and data.get("name"):
                clients.append({"id": doc.id, "name": data["name"], "createdAt": data.get("createdAt", datetime.now())})

        logger.info(f"クライアント一覧を取得しました: {len(clients)}件")
        return clients

    except Exception as e:
        logger.error(f"クライアント一覧取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"クライアント一覧の取得中にエラーが発生しました: {str(e)}")


@router.post("/", response_model=ClientResponse)
async def create_client(request: ClientCreateRequest):
    """新規クライアントを作成"""
    try:
        if not request.name.strip():
            raise HTTPException(status_code=400, detail="クライアント名は必須です")

        def create_client_doc():
            ref = clients_collection()
            doc_ref = ref.add({"name": request.name.strip(), "createdAt": SERVER_TIMESTAMP})
            return doc_ref[1]  # ドキュメント参照を返す

        doc_ref = exponential_backoff(create_client_doc)

        # 作成されたドキュメントを取得
        def get_created_doc():
            return doc_ref.get()

        doc = exponential_backoff(get_created_doc)
        data = doc.to_dict()

        result = {"id": doc.id, "name": data["name"], "createdAt": data.get("createdAt", datetime.now())}

        logger.info(f"クライアントを作成しました: {result['name']} (ID: {result['id']})")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"クライアント作成エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"クライアント作成中にエラーが発生しました: {str(e)}")


@router.get("/{client_name}/resources", response_model=List[ClientResource])
async def get_client_resources(client_name: str):
    """クライアントのリソース利用状況を取得"""
    try:

        def fetch_resources():
            ref = client_resources_collection()
            # 複合インデックスを避けるため、order_byを削除してフィルタのみ使用
            query = ref.where(filter=FieldFilter("client_name", "==", client_name))
            return query.stream()

        docs = exponential_backoff(fetch_resources)

        resources = []
        for doc in docs:
            data = doc.to_dict()
            if data:
                resources.append(
                    {
                        "id": doc.id,
                        "client_name": data.get("client_name", ""),
                        "resource_id": data.get("resource_id", ""),
                        "service_name": data.get("service_name", ""),
                        "status": data.get("status", "active"),
                        "notes": data.get("notes"),
                        "added_at": data.get("added_at", 0),
                        "added_by": data.get("added_by", ""),
                    }
                )

        # Python側で追加日時の降順でソート
        resources.sort(key=lambda x: x["added_at"], reverse=True)

        logger.info(f"クライアント {client_name} のリソース利用状況を取得: {len(resources)}件")
        return resources

    except Exception as e:
        logger.error(f"クライアントリソース取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"クライアントリソース取得中にエラーが発生しました: {str(e)}")


@router.post("/{client_name}/resources", response_model=ClientResource)
async def add_client_resource(client_name: str, request: ClientResourceCreate):
    """クライアントにリソース利用を追加"""
    try:

        def create_resource():
            ref = client_resources_collection()
            doc_ref = ref.add(
                {
                    "client_name": client_name,
                    "resource_id": request.resource_id,
                    "service_name": request.service_name,
                    "status": request.status,
                    "notes": request.notes,
                    "added_at": time.time(),
                    "added_by": config.TARGET_FIREBASE_USER_ID,
                }
            )
            return doc_ref[1]  # ドキュメント参照を返す

        doc_ref = exponential_backoff(create_resource)

        # 作成されたドキュメントを取得
        def get_created_doc():
            return doc_ref.get()

        doc = exponential_backoff(get_created_doc)
        data = doc.to_dict()

        result = {
            "id": doc.id,
            "client_name": data["client_name"],
            "resource_id": data["resource_id"],
            "service_name": data["service_name"],
            "status": data["status"],
            "notes": data.get("notes"),
            "added_at": data["added_at"],
            "added_by": data["added_by"],
        }

        logger.info(f"クライアント {client_name} にリソース利用を追加: {request.service_name}")
        return result

    except Exception as e:
        logger.error(f"クライアントリソース追加エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"クライアントリソース追加中にエラーが発生しました: {str(e)}")


@router.patch("/{client_name}/resources/{usage_id}")
async def update_client_resource(client_name: str, usage_id: str, request: ClientResourceUpdate):
    """クライアントのリソース利用状況を更新"""
    try:

        def update_resource():
            ref = client_resources_collection().document(usage_id)
            update_data = {}
            if request.status is not None:
                update_data["status"] = request.status
            if request.notes is not None:
                update_data["notes"] = request.notes
            ref.update(update_data)
            return ref

        exponential_backoff(update_resource)

        logger.info(f"クライアント {client_name} のリソース利用状況を更新: {usage_id}")
        return {"message": "更新しました"}

    except Exception as e:
        logger.error(f"クライアントリソース更新エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"クライアントリソース更新中にエラーが発生しました: {str(e)}")


@router.delete("/{client_name}/resources/{usage_id}")
async def delete_client_resource(client_name: str, usage_id: str):
    """クライアントのリソース利用を削除"""
    try:

        def delete_resource():
            ref = client_resources_collection().document(usage_id)
            ref.delete()

        exponential_backoff(delete_resource)

        logger.info(f"クライアント {client_name} のリソース利用を削除: {usage_id}")
        return {"message": "削除しました"}

    except Exception as e:
        logger.error(f"クライアントリソース削除エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"クライアントリソース削除中にエラーが発生しました: {str(e)}")


@router.get(
    "/{client_name}/suggestion",
    response_model=Suggestion,
    summary="Get and clear the suggestion for a client",
)
async def get_and_clear_suggestion(client_name: str):
    """
    クライアントのサジェストを取得し、取得後にDBから削除します。
    """
    try:
        client_ref = clients_collection().where(filter=FieldFilter("name", "==", client_name)).limit(1)

        def fetch_client_docs():
            return list(client_ref.stream())

        client_docs = exponential_backoff(fetch_client_docs)

        if not client_docs:
            raise HTTPException(status_code=404, detail="Client not found")

        client_doc = client_docs[0]
        suggestion_data = client_doc.to_dict().get("suggestion")

        if not suggestion_data:
            # サジェストがない場合は空のリストと文字列を返す
            return Suggestion(suggested_tasks=[], suggested_memo="")

        # サジェストをDBから削除
        def clear_suggestion_from_db():
            client_doc.reference.update({"suggestion": None})

        exponential_backoff(clear_suggestion_from_db)

        logger.info(f"クライアント {client_name} のサジェストを取得・削除しました。")
        return Suggestion(**suggestion_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"サジェスト取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"サジェストの取得中にエラーが発生しました: {str(e)}")
