import re
from datetime import timedelta, datetime


def relative_date_tool(text, base_ts):
    """相対的な日付表記を絶対表記に変更するためのヘルパー関数"""
    base_date = datetime.fromtimestamp(base_ts)
    patterns = [
        (
            r"来週月曜日",
            lambda d: d + timedelta(days=(7 - d.weekday() + 0) % 7 + 7),
        ),
        (
            r"来週火曜日",
            lambda d: d + timedelta(days=(7 - d.weekday() + 1) % 7 + 7),
        ),
        (
            r"来週水曜日",
            lambda d: d + timedelta(days=(7 - d.weekday() + 2) % 7 + 7),
        ),
        (
            r"来週木曜日",
            lambda d: d + timedelta(days=(7 - d.weekday() + 3) % 7 + 7),
        ),
        (
            r"来週金曜日",
            lambda d: d + timedelta(days=(7 - d.weekday() + 4) % 7 + 7),
        ),
        (
            r"来週土曜日",
            lambda d: d + timedelta(days=(7 - d.weekday() + 5) % 7 + 7),
        ),
        (
            r"来週日曜日",
            lambda d: d + timedelta(days=(7 - d.weekday() + 6) % 7 + 7),
        ),
        (r"今週月曜日", lambda d: d + timedelta(days=(0 - d.weekday()) % 7)),
        (r"今週火曜日", lambda d: d + timedelta(days=(1 - d.weekday()) % 7)),
        (r"今週水曜日", lambda d: d + timedelta(days=(2 - d.weekday()) % 7)),
        (r"今週木曜日", lambda d: d + timedelta(days=(3 - d.weekday()) % 7)),
        (r"今週金曜日", lambda d: d + timedelta(days=(4 - d.weekday()) % 7)),
        (r"今週土曜日", lambda d: d + timedelta(days=(5 - d.weekday()) % 7)),
        (r"今週日曜日", lambda d: d + timedelta(days=(6 - d.weekday()) % 7)),
        (r"明日", lambda d: d + timedelta(days=1)),
        (r"昨日", lambda d: d - timedelta(days=1)),
        (r"一昨日", lambda d: d - timedelta(days=2)),
        (r"今日", lambda d: d),
    ]
    for pat, func in patterns:

        def repl(match):
            target = func(base_date)
            return f"{target.strftime('%Y/%m/%d(%a)')}"

        text = re.sub(pat, repl, text)
    return text


def get_today_date_string():
    """今日のUTC日付をYYYY-MM-DD形式で取得するヘルパー関数"""
    today = datetime.utcnow()
    return today.strftime("%Y-%m-%d")