import json
from typing import Optional, List

from config import FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS


def get_google_service_account_info() -> dict:
    """
    Return the Google service account JSON as a dict.

    Preference order:
    1) FIREBASE_SERVICE_ACCOUNT (JSON string)
    2) GOOGLE_APPLICATION_CREDENTIALS (path to JSON file)

    Raises:
        RuntimeError if neither source is available or parsing fails.
    """
    if FIREBASE_SERVICE_ACCOUNT:
        try:
            return json.loads(FIREBASE_SERVICE_ACCOUNT)
        except Exception as e:
            raise RuntimeError(f"FIREBASE_SERVICE_ACCOUNT のJSON解析に失敗しました: {e}")

    if GOOGLE_APPLICATION_CREDENTIALS:
        try:
            import os

            path = GOOGLE_APPLICATION_CREDENTIALS
            if not os.path.exists(path):
                raise RuntimeError(f"GOOGLE_APPLICATION_CREDENTIALS のパスが存在しません: {path}")
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            raise RuntimeError(f"GOOGLE_APPLICATION_CREDENTIALS の読込に失敗しました: {e}")

    raise RuntimeError(
        "Google サービスアカウント情報が見つかりません。FIREBASE_SERVICE_ACCOUNT か GOOGLE_APPLICATION_CREDENTIALS を設定してください。"
    )


def get_google_service_account_credentials(scopes: Optional[List[str]] = None):
    """
    Build google.oauth2.service_account.Credentials from the service account info.
    Args:
        scopes: Optional OAuth2 scopes. Defaults to ['https://www.googleapis.com/auth/cloud-platform'].
    Returns:
        google.oauth2.service_account.Credentials
    Raises:
        RuntimeError if building credentials fails.
    """
    if scopes is None:
        scopes = ["https://www.googleapis.com/auth/cloud-platform"]
    try:
        from google.oauth2 import service_account

        info = get_google_service_account_info()
        return service_account.Credentials.from_service_account_info(info, scopes=scopes)
    except Exception as e:
        raise RuntimeError(f"サービスアカウント認証情報の生成に失敗しました: {e}")

