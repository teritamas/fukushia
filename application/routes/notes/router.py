from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google.cloud.firestore import SERVER_TIMESTAMP
from google.cloud.firestore_v1.base_query import FieldFilter
from ..common import db, logger, exponential_backoff
import config


router = APIRouter(prefix="/notes", tags=["notes"])


class TodoItem(BaseModel):
    id: str
    text: str
    due_date: Optional[str] = None
    is_completed: bool


class NoteCreateRequest(BaseModel):
    clientName: str
    content: str
    speaker: Optional[str] = None


class NoteUpdateRequest(BaseModel):
    content: Optional[str] = None
    speaker: Optional[str] = None
    todoItems: Optional[List[TodoItem]] = None


class NoteResponse(BaseModel):
    id: str
    clientName: str
    content: str
    speaker: Optional[str] = None
    timestamp: datetime
    todoItems: Optional[List[TodoItem]] = None


def notes_collection():
    """ノートコレクションへの参照を取得"""
    return (
        db.collection("artifacts")
        .document(config.TARGET_FIREBASE_APP_ID)
        .collection("users")
        .document(config.TARGET_FIREBASE_USER_ID)
        .collection("notes")
    )


@router.get("/", response_model=List[NoteResponse])
async def get_notes(client_name: Optional[str] = None):
    """ノート一覧を取得（クライアント名で絞り込み可能）"""
    try:

        def fetch_notes():
            ref = notes_collection()
            if client_name:
                query = ref.where(filter=FieldFilter("clientName", "==", client_name)).order_by("timestamp", direction="DESCENDING")
            else:
                query = ref.order_by("timestamp", direction="DESCENDING")
            return query.stream()

        docs = exponential_backoff(fetch_notes)

        notes = []
        for doc in docs:
            data = doc.to_dict()
            if data:
                # TodoItemsのフィールド名をFirestoreのisCompletedから
                # is_completedにマップ
                todo_items = data.get("todoItems", [])
                mapped_todo_items = []
                for item in todo_items:
                    if isinstance(item, dict):
                        mapped_item = {
                            "id": item.get("id", ""),
                            "text": item.get("text", ""),
                            "due_date": item.get("dueDate"),
                            "is_completed": item.get("isCompleted", False),
                        }
                        mapped_todo_items.append(mapped_item)

                note = {
                    "id": doc.id,
                    "clientName": data.get("clientName", ""),
                    "content": data.get("content", ""),
                    "speaker": data.get("speaker"),
                    "timestamp": data.get("timestamp", datetime.now()),
                    "todoItems": mapped_todo_items,
                }
                notes.append(note)

        logger.info(f"ノート一覧を取得しました: {len(notes)}件 (client: {client_name})")
        return notes

    except Exception as e:
        logger.error(f"ノート一覧取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ノート一覧の取得中にエラーが発生しました: {str(e)}")


@router.post("/", response_model=NoteResponse)
async def create_note(request: NoteCreateRequest):
    """新規ノートを作成"""
    try:
        if not request.clientName.strip():
            raise HTTPException(status_code=400, detail="クライアント名は必須です")
        if not request.content.strip():
            raise HTTPException(status_code=400, detail="内容は必須です")

        def create_note_doc():
            ref = notes_collection()
            doc_ref = ref.add(
                {
                    "clientName": request.clientName.strip(),
                    "content": request.content.strip(),
                    "speaker": request.speaker,
                    "timestamp": SERVER_TIMESTAMP,
                    "todoItems": [],
                }
            )
            return doc_ref[1]  # ドキュメント参照を返す

        doc_ref = exponential_backoff(create_note_doc)

        # 作成されたドキュメントを取得
        def get_created_doc():
            return doc_ref.get()

        doc = exponential_backoff(get_created_doc)
        data = doc.to_dict()

        result = {
            "id": doc.id,
            "clientName": data["clientName"],
            "content": data["content"],
            "speaker": data.get("speaker"),
            "timestamp": data.get("timestamp", datetime.now()),
            "todoItems": data.get("todoItems", []),
        }

        logger.info(f"ノートを作成しました: {result['clientName']} (ID: {result['id']})")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ノート作成エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ノート作成中にエラーが発生しました: {str(e)}")


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(note_id: str):
    """IDを指定してノートを1件取得"""
    try:

        def get_note_doc():
            return notes_collection().document(note_id).get()

        doc = exponential_backoff(get_note_doc)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="ノートが見つかりません")

        data = doc.to_dict()

        # TodoItemsのフィールド名をFirestoreのisCompletedから
        # is_completedにマップ
        todo_items = data.get("todoItems", [])
        mapped_todo_items = []
        for item in todo_items:
            if isinstance(item, dict):
                mapped_item = {
                    "id": item.get("id", ""),
                    "text": item.get("text", ""),
                    "due_date": item.get("dueDate"),
                    "is_completed": item.get("isCompleted", False),
                }
                mapped_todo_items.append(mapped_item)

        result = {
            "id": doc.id,
            "clientName": data["clientName"],
            "content": data["content"],
            "speaker": data.get("speaker"),
            "timestamp": data.get("timestamp", datetime.now()),
            "todoItems": mapped_todo_items,
        }

        logger.info(f"ノートを取得しました: ID {note_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ノート取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ノート取得中にエラーが発生しました: {str(e)}")


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(note_id: str, request: NoteUpdateRequest):
    """ノートを更新"""
    try:

        def get_note_doc():
            return notes_collection().document(note_id).get()

        doc = exponential_backoff(get_note_doc)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="ノートが見つかりません")

        # 更新データを準備
        update_data = {}
        if request.content is not None:
            update_data["content"] = request.content.strip()
        if request.speaker is not None:
            update_data["speaker"] = request.speaker
        if request.todoItems is not None:
            # TodoItemのフィールド名をAPIのis_completedから
            # FirestoreのisCompletedにマップ
            mapped_todo_items = []
            for item in request.todoItems:
                item_dict = item.dict()
                firestore_item = {
                    "id": item_dict.get("id", ""),
                    "text": item_dict.get("text", ""),
                    "dueDate": item_dict.get("due_date"),
                    "isCompleted": item_dict.get("is_completed", False),
                }
                mapped_todo_items.append(firestore_item)
            update_data["todoItems"] = mapped_todo_items

        if not update_data:
            raise HTTPException(status_code=400, detail="更新するデータがありません")

        def update_note_doc():
            notes_collection().document(note_id).update(update_data)
            return notes_collection().document(note_id).get()

        updated_doc = exponential_backoff(update_note_doc)
        data = updated_doc.to_dict()

        # TodoItemsのフィールド名をFirestoreのisCompletedから
        # is_completedにマップ
        todo_items = data.get("todoItems", [])
        mapped_todo_items = []
        for item in todo_items:
            if isinstance(item, dict):
                mapped_item = {
                    "id": item.get("id", ""),
                    "text": item.get("text", ""),
                    "due_date": item.get("dueDate"),
                    "is_completed": item.get("isCompleted", False),
                }
                mapped_todo_items.append(mapped_item)

        result = {
            "id": updated_doc.id,
            "clientName": data["clientName"],
            "content": data["content"],
            "speaker": data.get("speaker"),
            "timestamp": data.get("timestamp", datetime.now()),
            "todoItems": mapped_todo_items,
        }

        logger.info(f"ノートを更新しました: ID {note_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ノート更新エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ノート更新中にエラーが発生しました: {str(e)}")


@router.delete("/{note_id}")
async def delete_note(note_id: str):
    """ノートを削除"""
    try:

        def get_note_doc():
            return notes_collection().document(note_id).get()

        doc = exponential_backoff(get_note_doc)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="ノートが見つかりません")

        def delete_note_doc():
            notes_collection().document(note_id).delete()

        exponential_backoff(delete_note_doc)

        logger.info(f"ノートを削除しました: ID {note_id}")
        return {"message": "ノートを削除しました"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ノート削除エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ノート削除中にエラーが発生しました: {str(e)}")
