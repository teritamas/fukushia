import firebase_admin
from firebase_admin import credentials, firestore
import json

def init_firestore(firebase_config_json: str):
    if not firebase_config_json:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT環境変数が見つかりません。")
    firebase_service_account_data = json.loads(firebase_config_json)
    cred = credentials.Certificate(firebase_service_account_data)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    client_email = firebase_service_account_data.get("client_email", "")
    return db, client_email
