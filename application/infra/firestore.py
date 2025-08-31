import firebase_admin
from firebase_admin import credentials, firestore
import json
from config import FIREBASE_SERVICE_ACCOUNT


# FastAPI用: 環境変数から自動で初期化し、dbのみ返す
def get_firestore_client():
    if not FIREBASE_SERVICE_ACCOUNT:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT環境変数が見つかりません。")
    firebase_service_account_data = json.loads(FIREBASE_SERVICE_ACCOUNT)
    cred = credentials.Certificate(firebase_service_account_data)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    return db
