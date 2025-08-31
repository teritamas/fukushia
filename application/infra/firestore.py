import firebase_admin
from firebase_admin import credentials, firestore
from utils.auth.google_credentials import get_google_service_account_info


# FastAPI用: 環境変数から自動で初期化し、dbのみ返す
def get_firestore_client():
    info = get_google_service_account_info()
    cred = credentials.Certificate(info)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    return db
