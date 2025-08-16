FROM python:3.13-slim

WORKDIR /app

# uvインストール
RUN pip install --upgrade pip && pip install uv

# ソースコピー
COPY application/ /app/

# 依存インストール（pyproject.toml/requirements.txtに応じて）
RUN uv pip install -r requirements.txt || uv pip install --project .

ENV PORT=8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
