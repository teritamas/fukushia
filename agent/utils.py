from datetime import datetime

def get_today_date_string():
    """今日のUTC日付をYYYY-MM-DD形式で取得するヘルパー関数"""
    today = datetime.utcnow()
    return today.strftime('%Y-%m-%d')
