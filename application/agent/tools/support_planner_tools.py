def format_resource_explanation(resource: dict, client_name: str = "利用者", client_context: str = "") -> str:
    """
    Firestoreから取得した制度データ(JSON)を日本語説明文に変換。
    利用者名・状況も受け取り、対象判定・推奨可否も出力。
    """
    name = resource.get("service_name", "不明な制度")
    desc = resource.get("description") or "説明情報なし"
    target = resource.get("target_users") or "対象情報なし"
    eligibility = resource.get("eligibility") or "利用条件情報なし"
    process = resource.get("application_process") or "申請方法情報なし"
    cost = resource.get("cost") or "費用情報なし"
    location = resource.get("location") or "地域情報なし"
    category = resource.get("category") or "カテゴリ情報なし"
    # 対象判定（簡易: 利用者状況や名前がtarget/eligibilityに含まれるか）
    context_text = f"{client_name} {client_context}".strip()
    is_target = (
        client_name in target or client_name in eligibility or client_context in target or client_context in eligibility
    )
    target_comment = "利用者は制度の対象です。" if is_target else "利用者は制度の対象か追加確認が必要です。"
    # 推奨可否（困りごと・状況がdescriptionやcategoryに含まれるか）
    recommend = client_context in desc or client_context in category
    if recommend:
        # 推奨理由を生成
        recommend_reason = (
            "利用者の状況（%s）が説明やカテゴリに合致しているため、制度の利用が推奨されます。" % client_context
            if client_context
            else "利用者の状況が制度の説明やカテゴリに合致しているため、制度の利用が推奨されます。"
        )
        recommend_text = f"この制度の利用は推奨されます。理由: {recommend_reason}"
    else:
        recommend_text = "この制度の利用は必ずしも推奨されません。"
    return (
        f"【{name}】\n"
        f"説明: {desc}\n"
        f"対象: {target}\n"
        f"利用条件: {eligibility}\n"
        f"申請方法: {process}\n"
        f"費用: {cost}\n"
        f"地域: {location}\n"
        f"カテゴリ: {category}\n"
        f"{target_comment} {recommend_text}"
    )


# 制度名でDBから詳細を取得するツール
from langchain.agents import tool
from pydantic.v1 import BaseModel, Field


class ResourceDetailInput(BaseModel):
    resource_name: str = Field(description="取得したい制度・サービスの正式名称。例: 高齢者外出支援事業")


@tool("search_resource_detail", args_schema=ResourceDetailInput, return_direct=True)
def search_resource_detail(resource_name: str) -> str:
    """
    制度・サービス名でDBから詳細情報を取得する。説明・対象・申請方法・費用などを返す。
    """
    # Firestore直接参照で部分一致検索
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "serviceAccountKey.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    app_id = os.environ.get("TARGET_FIREBASE_APP_ID", "1:667712908416:web:ad84cae4853ac6de444a65")
    user_id = os.environ.get("TARGET_FIREBASE_USER_ID", "firebase-adminsdk-fbsvc@tritama-e20cf.iam.gserviceaccount.com")
    resources_ref = (
        db.collection("artifacts").document(app_id).collection("users").document(user_id).collection("resources")
    )
    docs = resources_ref.stream()
    # 部分一致（複数ヒット時は最初のものを返す）
    norm_name = resource_name.strip().lower()
    matches = []
    for doc in docs:
        r = doc.to_dict()
        service_name = str(r.get("service_name", "")).lower()
        if norm_name in service_name:
            r["id"] = doc.id
            matches.append(r)
    if matches:
        # 利用者情報は外部から渡す設計（ここでは仮で空）
        return format_resource_explanation(matches[0])
    return f"(NO_RESULT) {resource_name} に該当する制度・サービスがDBに見つかりませんでした。"


# 状況・困りごと・地域で提案するツール
class SuggestResourcesInput(BaseModel):
    situation: str = Field(description="利用者の状況や困りごと、地域など。例: 山形市 生活困窮 就労支援")


@tool("suggest_resources", args_schema=SuggestResourcesInput, return_direct=False)
def suggest_resources(situation: str) -> str:
    """
    利用者の状況・困りごと・地域から該当する制度・サービスを提案する。
    """
    # Firestore直接参照で部分一致検索
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "serviceAccountKey.json")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    app_id = os.environ.get("TARGET_FIREBASE_APP_ID", "1:667712908416:web:ad84cae4853ac6de444a65")
    user_id = os.environ.get("TARGET_FIREBASE_USER_ID", "firebase-adminsdk-fbsvc@tritama-e20cf.iam.gserviceaccount.com")
    resources_ref = (
        db.collection("artifacts").document(app_id).collection("users").document(user_id).collection("resources")
    )
    docs = resources_ref.stream()
    norm_query = situation.strip().lower()
    query_tokens = [t for t in norm_query.split() if t]
    results = []
    for doc in docs:
        r = doc.to_dict()
        haystack = " ".join(
            [
                str(r.get("service_name", "")),
                str(r.get("category", "")),
                str(r.get("description", "")),
                str(r.get("provider", "")),
                str(r.get("location", "")),
                str(r.get("target_users", "")),
                " ".join(r.get("keywords", [])),
            ]
        ).lower()
        # 部分一致（AND条件）
        if all(q in haystack for q in query_tokens):
            r["id"] = doc.id
            results.append(r)
    if results:
        return json.dumps(results, ensure_ascii=False, indent=2)
    else:
        return f"(NO_RESULT) {situation} に該当する制度・サービスがDBに見つかりませんでした。"


# Firestore用
import json
import os
import firebase_admin
from firebase_admin import credentials, firestore
from langchain.agents import tool
from pydantic.v1 import BaseModel, Field
import logging

# loggingの設定
logging.basicConfig(level=logging.INFO)

import requests


def fetch_resources_via_api(api_url: str = "http://localhost:8000/resources/") -> list:
    """
    FastAPIの/resources/エンドポイントから社会資源一覧を取得する。
    Returns:
        List[dict]: Resource情報のリスト
    Raises:
        Exception: API呼び出し失敗時
    """
    try:
        response = requests.get(api_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        raise RuntimeError(f"API経由で社会資源一覧取得失敗: {e}")


class ExtractInfoInput(BaseModel):
    assessment_text: str = Field(description="相談者のアセスメント情報が記載されたテキスト。")


class SearchInput(BaseModel):
    query: str = Field(description="検索クエリ。地名と具体的な困りごと（例：「南陽市 就労支援」）を含めること。")


def reset_search_state():
    """支援計画生成 1 セッションごとのローカル検索状態をリセット。"""
    global _SEARCH_HISTORY, _LOCAL_SEARCH_ATTEMPTS, _LOCAL_SEARCH_FAILURES
    _SEARCH_HISTORY = []
    _LOCAL_SEARCH_ATTEMPTS = 0
    _LOCAL_SEARCH_FAILURES = 0


@tool("google_search", args_schema=SearchInput, return_direct=False)
def google_search(query: str) -> str:
    """
    Google検索を実行し、最新の制度情報や広範なウェブ上の情報を取得する。
    `search_local_resources`で情報が見つからなかった場合や、より新しい情報が必要な場合に使用する。
    """
    logging.info(f"【Tool】Executing google_search with query: {query}")
    # このツールはGeminiAgentクラス内でAPIキーを使って初期化する必要がある
    # ここではプレースホルダーとして定義
    raise NotImplementedError("Google Search must be initialized within the GeminiAgent class.")


class CreatePlanInput(BaseModel):
    payload: str = Field(
        description='最終計画生成用のJSON文字列。例: {"supporter_info": {...}, "investigation_results": ["..."]}。自然文の場合は内部でベストエフォート抽出。'
    )
