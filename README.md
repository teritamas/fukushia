# assessment_assistant

社会福祉士向けのメモ・タスク管理＆アセスメント支援アプリです。Streamlitで動作し、Firebase FirestoreとGemini APIを利用します。

## 機能

- 支援者（クライアント）管理
- 日々のメモ・TODOリスト登録・管理
- Firestoreによるデータ保存
- Gemini APIによるアセスメントシート自動提案

## セットアップ

1. **リポジトリをクローン**
    ```sh
    git clone <このリポジトリのURL>
    cd assessment_assistant
    ```

2. **Python仮想環境の作成・有効化**
    ```sh
    python -m venv venv
    venv\Scripts\activate
    ```

3. **依存パッケージのインストール**
    ```sh
    pip install streamlit firebase-admin google-generativeai
    ```

4. **FirebaseサービスアカウントキーとGemini APIキーの設定**
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

- `.streamlit/secrets.toml` には機密情報が含まれるため、**絶対にGit等で公開しないでください**。
- Firestoreのデータ構造やユーザーIDはReactアプリと一致させてください。

---

ご質問・不具合はIssueまたはPull Requestでご連絡ください。
