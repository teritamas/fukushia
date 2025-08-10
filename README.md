# assessment_assistant

社会福祉士向けのメモ・タスク管理＆アセスメント支援アプリです。Streamlit で動作し、Firebase Firestore と Gemini API を利用します。

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

   - `.streamlit/secrets.toml` に以下のように記述してください:

   ```toml
   FIREBASE_SERVICE_ACCOUNT = '''
   { ...FirebaseサービスアカウントのJSON... }
   '''
   GEMINI_API_KEY = "あなたのGemini APIキー"
   APP_ID = "default-app-id"
   ```

## 起動方法

```sh
streamlit run app.py

or

uv run streamlit run app.py
```

ブラウザで `http://localhost:8501` を開いて利用できます。

## ディレクトリ構成

```
assessment_assistant/
├── app.py
└── .streamlit/
    └── secrets.toml
```

## 注意事項

- `.streamlit/secrets.toml` には機密情報が含まれるため、**絶対に Git 等で公開しないでください**。
- Firestore のデータ構造やユーザー ID は React アプリと一致させてください。

---

ご質問・不具合は Issue または Pull Request でご連絡ください。
