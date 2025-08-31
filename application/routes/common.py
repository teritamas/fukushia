import logging

from google.cloud import firestore
from google.api_core.exceptions import NotFound as FirestoreNotFound

from infra.firestore import get_firestore_client
import config


# logging
logging.basicConfig(level=getattr(logging, config.LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)


def _init_firestore():
    """Initialize Firestore client. Prefer Firebase Admin via helper, fallback to ADC client."""
    try:
        return get_firestore_client()
    except Exception as e:
        logger.warning(f"Firebase Admin init failed, fallback to google.cloud.firestore.Client: {e}")
        try:
            project_id = config.FIREBASE_PROJECT_ID
            if project_id:
                client = firestore.Client(project=project_id)
            else:
                client = firestore.Client()
            logger.info(f"Firestore Client initialized (project={client.project})")
            return client
        except Exception as inner:
            logger.error(f"Firestore initialization failed: {inner}")
            raise


db = _init_firestore()


def resource_collection():
    return (
        db.collection("artifacts")
        .document(config.TARGET_FIREBASE_APP_ID)
        .collection("users")
        .document(config.TARGET_FIREBASE_USER_ID)
        .collection("resources")
    )


def resource_memo_collection():
    return (
        db.collection("artifacts")
        .document(config.TARGET_FIREBASE_APP_ID)
        .collection("users")
        .document(config.TARGET_FIREBASE_USER_ID)
        .collection("resource_memos")
    )


def exponential_backoff(func, max_attempts: int = 5, initial_delay: float = 1.0, max_delay: float = 16.0):
    import time, random

    delay = initial_delay
    for attempt in range(max_attempts):
        try:
            return func()
        except Exception:
            if attempt == max_attempts - 1:
                raise
            time.sleep(delay + random.uniform(0, 0.5))
            delay = min(delay * 2, max_delay)
