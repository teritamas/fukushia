
import os
import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore
import json

load_dotenv()


# FastAPI用: 環境変数から自動で初期化し、dbのみ返す
def get_firestore_client():
    firebase_config_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if not firebase_config_json:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT環境変数が見つかりません。")
    firebase_service_account_data = json.loads(firebase_config_json)
    cred = credentials.Certificate(firebase_service_account_data)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    return db
