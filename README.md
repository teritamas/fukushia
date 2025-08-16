# assessment_assistant

社会福祉士向けのメモ・タスク管理＆アセスメント支援アプリです。Streamlit で動作し、Firebase Firestore と Gemini API を利用します。

- [デモサイト](https://tritama-e20cf.web.app/)
- [API Docs](https://assessment-assistant-backend-667712908416.europe-west1.run.app/docs)

## 機能

- 支援者（クライアント）管理
- 日々のメモ・TODO リスト登録・管理
- Firestore によるデータ保存
- Gemini API によるアセスメントシート自動提案

## セットアップ

1. **リポジトリをクローン**

   ```sh
   git clone <このリポジトリのURL>
   cd assessment_assistant
   ```

2. **Python 仮想環境の作成・有効化 (uv)**

   ```sh
   uv venv
   source .venv/bin/activate  # Windows は `.venv\Scripts\activate`
   ```

3. **依存パッケージのインストール**

   ```sh
   uv sync  # pyproject.tomlに基づき依存関係を解決・インストール
   ```

4. **Firebase サービスアカウントキーと Gemini API キーの設定**

- `application/`フォルダー内に `.env` ファイルを作成し、以下の内容を記述してください:

```
# Firebase サービスアカウントキー
FIREBASE_SERVICE_ACCOUNT = サービスアカウントのキーを 1 行で書く

# Gemini API キー
GEMINI_API_KEY="あなたの Gemini API キー"
GOOGLE_CSE_ID="あなたのGoogle CSE ID"
```

- `frontend/`フォルダー内に `.env` ファイルを作成し、以下の内容を記述してください

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL=
```

## 起動方法

### フロントエンドの起動

```sh
cd frontend/
npm run dev
```

### バックエンドの起動

```sh
cd application/
uvicorn main:app --reload

or

uv run uvicorn main:app --reload
```

## Docker で API サーバをビルド・実行する

**application/ ディレクトリで以下を実行してください**

```sh
cd application
docker build -t assessment_api .
docker run --rm -p 8000:8000 assessment_api
```
