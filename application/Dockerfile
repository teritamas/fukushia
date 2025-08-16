FROM python:3.13-slim

WORKDIR /app

# uvインストール
RUN pip install --upgrade pip --no-cache-dir && pip install --no-cache-dir uv==0.8.5

# ソースコピー
COPY . /app/

# 依存インストール（pyproject.toml/requirements.txtに応じて）
RUN uv sync
ENV PORT=8080

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
