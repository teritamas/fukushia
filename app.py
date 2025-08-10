import streamlit as st
import os
from agent.firestore import init_firestore
from agent.gemini import GeminiAgent
from datetime import datetime, timedelta
from firebase_admin import firestore

# --- 1. 初期化 ---
APP_ID = os.getenv("APP_ID", "default-app-id")

try:
    firebase_service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    db, client_email = init_firestore(firebase_service_account)
except Exception as e:
    st.error(f"Firestore初期化エラー: {e}")
    st.stop()

try:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    gemini_agent = GeminiAgent(GEMINI_API_KEY)
except Exception as e:
    st.error(f"GeminiAgent初期化エラー: {e}")
    st.stop()

# --- 3. データ取得関数 ---
@st.cache_data(ttl=300) # 5分間キャッシュ
def get_clients(user_id: str):
    """Firestoreから支援者リストを取得します。"""
    clients_ref = db.collection(f'artifacts/{APP_ID}/users/{user_id}/clients')
    clients = []
    for doc in clients_ref.stream():
        clients.append(doc.to_dict()['name'])
    return sorted(clients)

@st.cache_data(ttl=300) # 5分間キャッシュ
def get_notes_for_client(user_id: str, client_name: str = None, days_ago: int = None):
    """
    指定されたユーザーと支援者（任意）、期間（任意）のメモを取得します。
    client_nameがNoneの場合は全ての支援者のメモを取得します。
    """
    notes_ref = db.collection(f'artifacts/{APP_ID}/users/{user_id}/notes')
    query = notes_ref

    if client_name:
        query = query.where('clientName', '==', client_name)

    if days_ago:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days_ago)
        query = query.where('timestamp', '>=', start_date)\
                     .where('timestamp', '<=', end_date)

    query = query.order_by('timestamp', direction=firestore.Query.DESCENDING) # 新しいものが上に来るように

    notes_data = []
    for doc in query.stream():
        note = doc.to_dict()
        note['id'] = doc.id
        # Timestamp のインスタンスチェックは Timestamp そのものを使用
        if isinstance(note.get('timestamp'), datetime): 
            note['timestamp'] = note['timestamp'].isoformat()
        if note.get('todoItems'):
            for item in note['todoItems']:
                # Timestamp のインスタンスチェックは Timestamp そのものを使用
                if isinstance(item.get('dueDate'), datetime): 
                    item['dueDate'] = item['dueDate'].isoformat()
        notes_data.append(note)
    return notes_data

# --- 4. LLMによるテキスト分析関数 ---
# analyze_content_with_geminiはagent/gemini.pyからimport

# --- Streamlit アプリのメイン部分 ---
st.set_page_config(page_title="社会福祉士向けアシスタント", layout="wide")

st.title("📝 社会福祉士向けアシスタントアプリ")
st.markdown("日々のメモやTODO、そしてアセスメント更新をサポートします。")

# ユーザーIDの取得
if 'user_id' not in st.session_state:
    st.session_state['user_id'] = client_email

user_id_display = st.session_state.user_id
st.info(f"現在のユーザーID: **{user_id_display}**\n\n**重要:** このユーザーIDは、Reactアプリで使用している`userId`と同じである必要があります。異なる場合はFirestoreのデータにアクセスできません。")

# アセスメントシートの主要項目を定義
ASSESSMENT_ITEMS = {
    "Ⅰ．本人の状況": [
        "判断能力の状況（長谷川式スケール、ＭＭＳＥ、手帳の有無、判断能力低下傾向）",
        "就労状況",
        "生活保護の状況",
        "収入源（年金、給料、生活保護費、その他、金額）",
        "財産等の状況（預貯金、その他）",
        "借入金・滞納など（総額、返済額、借入先、残額）",
        "金銭管理や手続きの支援の状況",
        "親族との関係"
    ],
    "Ⅱ．本人の強み、選好、生活の意向、意思": [
        "強み、大切にしていること・好きなこと",
        "嫌なこと・されたくないこと",
        "どのような生活を希望しているか？親族への思い"
    ],
    "Ⅲ．日常生活自立支援事業による支援の必要性の確認": [
        "福祉サービスの利用援助に関すること",
        "日常的金銭管理に関すること（金融機関からの出金、支払い行為、収入額・支出額に関する本人の認識、支出管理・優先順位付、債務整理等）",
        "申請・手続き・契約支援に関すること（必要な申請・手続き・契約、不利な契約（消費者被害など））",
        "重要な書類の管理に関すること（通帳や土地の権利書などの管理、郵便物を開封して書類を読むこと）",
        "日常生活自立支援事業による支援の必要性のまとめ（具体的に必要と思われる支援、本人の意向・思い）",
        "一時的な支援（キャッシュカード・携帯電話等の解約支援、行政手続き等支援、緊急連絡先の把握の支援など）"
    ],
    "Ⅳ．日常生活自立支援事業以外の支援の必要性・可能性": [
        "その他の支援の必要性（医療等へのつなぎ、虐待通報、成年後見制度へのつなぎなど）",
        "日常生活自立支援事業以外の支援による課題解消の可能性（法テラスの利用、消費生活センターへの相談、ケアマネジャー等との連携による意思決定支援など）"
    ],
    "Ⅴ．検討・決定事項と支援の目標（解決すべき支援課題）": [
        "日常生活自立支援事業の利用有無（福祉サービス利用援助、日常的金銭管理、書類預かり）",
        "解決したい課題（債務整理、不必要な契約の解約支援、金融機関からの引き出し支援、必要な支払いの支援、通帳等の安全な保管、郵便物の内容確認支援など）",
        "本人の意向を踏まえたサービス提供における目標"
    ]
}

# --- タブの作成 ---
tab1, tab2 = st.tabs(["📄 メモとタスク管理", "🤖 アセスメントアシスタント"])

with tab1:
    st.header("📄 メモとタスク管理")

    # --- 支援者登録機能 ---
    with st.expander("✨ 新しい支援者を登録する"):
        new_client_name = st.text_input("新しい支援者名:", key="new_client_input", placeholder="例: 佐藤 健")
        if st.button("支援者を登録", key="add_client_button"):
            if new_client_name.strip():
                try:
                    # 既存のクライアントリストを更新しないと重複チェックができないため、再取得
                    current_clients = get_clients(st.session_state.user_id) 
                    if new_client_name.strip() not in current_clients:
                        client_ref = db.collection(f'artifacts/{APP_ID}/users/{st.session_state.user_id}/clients')
                        # Timestamp を使用
                        client_ref.add({
                            "name": new_client_name.strip(),
                            "createdAt": datetime.now() 
                        })
                        st.success(f"『{new_client_name.strip()}』さんを支援者として登録しました！")
                        st.cache_data.clear() # キャッシュをクリアしてクライアントリストを更新
                        st.rerun() # アプリを再実行してリストを更新
                    else:
                        st.warning(f"『{new_client_name.strip()}』さんは既に登録されています。")
                except Exception as e:
                    st.error(f"支援者の登録中にエラーが発生しました: {e}")
            else:
                st.warning("支援者名を入力してください。")

    st.markdown("---")

    # --- メモ入力フォーム ---
    st.subheader("新しいメモを追加")
    
    # 支援者選択
    clients_for_memo = get_clients(st.session_state.user_id) # 最新のクライアントリストを取得

    # 最初にリセットフラグを確認し、ウィジェットの値を初期化
    if 'reset_memo_client_select' in st.session_state and st.session_state.reset_memo_client_select:
        st.session_state.memo_client_select = "--- 選択してください ---"
        st.session_state.reset_memo_client_select = False

    # もしsession_stateにmemo_client_selectがなければ初期化
    if "memo_client_select" not in st.session_state:
        st.session_state.memo_client_select = "--- 選択してください ---"

    memo_client_name = st.selectbox(
        "誰の支援者のこと？ (必須)",
        ["--- 選択してください ---"] + clients_for_memo,
        key="memo_client_select",
        index=0,
    )

    memo_speaker = st.text_input(
        "誰からの発言？",
        key="memo_speaker_input",
        placeholder="例: 鈴木先生, ご本人"
    )

    memo_content = st.text_area(
        "メモ内容 (任意)",
        key="memo_content_input",
        placeholder="今日の相談内容、重要な情報など"
    )

    st.markdown("---")
    st.subheader("やることリスト")
    
    # 動的なタスク入力欄の状態をセッションステートで管理
    if 'task_input_fields' not in st.session_state:
        st.session_state.task_input_fields = [{'id': 'initial', 'text': '', 'dueDate': ''}]

    for i, task in enumerate(st.session_state.task_input_fields):
        col1, col2, col3 = st.columns([0.6, 0.3, 0.1])
        with col1:
            task_text = st.text_input(
                "やることの内容",
                value=task['text'],
                key=f"task_text_{task['id']}",
                label_visibility="collapsed",
                placeholder="やることの内容"
            )
        with col2:
            task_due_date = st.date_input(
                "期限",
                value=datetime.strptime(task['dueDate'], '%Y-%m-%d').date() if task['dueDate'] else None,
                key=f"task_duedate_{task['id']}",
                label_visibility="collapsed",
                format="YYYY-MM-DD"
            )
            # Streamlitのdate_inputはdatetime.dateオブジェクトを返すため、文字列に変換して保存
            if task_due_date:
                task_due_date = task_due_date.isoformat()

        with col3:
            if st.session_state.task_input_fields.index(task) > 0: # 最初の項目以外に削除ボタンを表示
                if st.button("🗑️", key=f"remove_task_{task['id']}"):
                    st.session_state.task_input_fields.pop(i)
                    st.experimental_rerun() # 削除時に再描画

        # 変更をセッションステートに反映
        st.session_state.task_input_fields[i]['text'] = task_text
        st.session_state.task_input_fields[i]['dueDate'] = task_due_date


    if st.button("＋", key="add_task_input_button"):
        st.session_state.task_input_fields.append({'id': str(datetime.now().timestamp()), 'text': '', 'dueDate': ''})
        st.experimental_rerun() # 新しい入力欄が即座に表示されるように再実行


    # 「メモを保存」ボタンの有効/無効とスタイルの条件
    has_valid_content = memo_content.strip() != '' or any(task['text'].strip() != '' for task in st.session_state.task_input_fields)
    is_save_button_enabled = memo_client_name != "--- 選択してください ---" and has_valid_content

    save_button_class = f"w-full font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform mt-4 {'bg-blue-600 hover:bg-blue-700 text-white hover:scale-105' if is_save_button_enabled else 'bg-gray-400 text-gray-700 cursor-not-allowed'}"

    if st.button("メモを保存", key="save_memo_button", disabled=not is_save_button_enabled):
        try:
            # 空のタスク入力欄をフィルタリングし、Firestore保存用に整形
            todo_items_to_save = [
                {
                    "text": task['text'].strip(),
                    "dueDate": datetime.fromisoformat(task['dueDate']) if task['dueDate'] else None,
                    "isCompleted": False,
                    "id": task['id']
                }
                for task in st.session_state.task_input_fields if task['text'].strip() != ''
            ]
            
            # 新しい支援者であればClientsコレクションに追加 (念のためここでもチェック)
            current_clients_check = get_clients(st.session_state.user_id)
            if memo_client_name not in current_clients_check:
                 client_ref = db.collection(f'artifacts/{APP_ID}/users/{st.session_state.user_id}/clients')
                 # Timestamp を使用
                 client_ref.add({
                     "name": memo_client_name,
                     "createdAt": datetime.now() 
                 })
                 st.cache_data.clear() # クライアントキャッシュをクリア

            db.collection(f'artifacts/{APP_ID}/users/{st.session_state.user_id}/notes').add({
                "clientName": memo_client_name,
                "speaker": memo_speaker.strip(),
                "content": memo_content.strip(),
                "todoItems": todo_items_to_save,
                # Timestamp を使用
                "timestamp": datetime.now(), 
            })
            st.success("メモを保存しました！")
            
            # フォームをリセット
            st.session_state.task_input_fields = [{'id': 'initial', 'text': '', 'dueDate': ''}]
            st.session_state.reset_memo_client_select = True
            st.session_state.memo_speaker_input = ""
            st.session_state.memo_content_input = ""
            st.cache_data.clear()
            st.experimental_rerun()
            
        except Exception as e:
            st.error(f"メモの保存中にエラーが発生しました: {e}")
            st.exception(e) # デバッグ用に例外の詳細を表示

    st.markdown("---")

    # --- メモリストの表示 ---
    st.subheader("登録済みメモ")
    
    # フィルタリングオプション
    col_filter1, col_filter2 = st.columns([0.6, 0.4])
    with col_filter1:
        selected_client_filter_memo = st.selectbox(
            "支援者で絞り込む:",
            ["all"] + clients_for_memo,
            format_func=lambda x: "全ての支援者" if x == "all" else x,
            key="memo_client_filter"
        )
    with col2:
        filter_type_memo = st.radio(
            "表示タイプ:",
            ["all", "todo", "completed"],
            format_func=lambda x: {"all": "全て", "todo": "未完了タスク", "completed": "完了済みタスク"}[x],
            horizontal=True,
            key="memo_type_filter"
        )

    # フィルタリングされたメモの取得
    if selected_client_filter_memo == "all":
        filtered_notes_display = get_notes_for_client(st.session_state.user_id)
    else:
        filtered_notes_display = get_notes_for_client(st.session_state.user_id, selected_client_filter_memo)

    # タイプによる絞り込み
    if filter_type_memo == 'todo':
        filtered_notes_display = [note for note in filtered_notes_display if note.get('todoItems') and any(item for item in note['todoItems'] if not item['isCompleted'])]
    elif filter_type_memo == 'completed':
        filtered_notes_display = [note for note in filtered_notes_display if note.get('todoItems') and all(item['isCompleted'] for item in note['todoItems'])]
    
    if not filtered_notes_display:
        st.info("条件に合うメモが見つかりませんでした。")
    else:
        for note in filtered_notes_display:
            st.markdown(f"**{note['clientName']}** ({note['timestamp'].split('T')[0]})")
            if note.get('speaker'):
                st.markdown(f"**発言者**: {note['speaker']}")
            if note.get('content').strip():
                st.markdown(f"**メモ内容**: {note['content']}")
            
            if note.get('todoItems'):
                st.markdown("**やることリスト:**")
                for todo_item in note['todoItems']:
                    checkbox_state = st.checkbox(
                        f" {todo_item['text']}" + (f" (期限: {datetime.fromisoformat(todo_item['dueDate']).strftime('%Y-%m-%d')})" if todo_item['dueDate'] else ""),
                        value=todo_item['isCompleted'],
                        key=f"todo_checkbox_{note['id']}_{todo_item['id']}" # ユニークなキー
                    )
                    # チェックボックスの状態が変更されたらFirestoreを更新
                    if checkbox_state != todo_item['isCompleted']:
                        try:
                            note_ref = db.collection(f'artifacts/{APP_ID}/users/{st.session_state.user_id}/notes').document(note['id'])
                            updated_todo_items = []
                            for item in note['todoItems']:
                                if item['id'] == todo_item['id']:
                                    updated_todo_items.append({**item, 'isCompleted': checkbox_state})
                                else:
                                    updated_todo_items.append(item)
                            note_ref.update({'todoItems': updated_todo_items})
                            st.cache_data.clear() # キャッシュをクリアして再描画
                            st.experimental_rerun()
                        except Exception as e:
                            st.error(f"TODOの更新中にエラーが発生しました: {e}")
            
            if st.button("メモを削除", key=f"delete_note_{note['id']}"):
                try:
                    db.collection(f'artifacts/{APP_ID}/users/{st.session_state.user_id}/notes').document(note['id']).delete()
                    st.success("メモを削除しました。")
                    st.cache_data.clear() # キャッシュをクリアして再描画
                    st.experimental_rerun()
                except Exception as e:
                    st.error(f"メモの削除中にエラーが発生しました: {e}")

            st.markdown("---")


with tab2:
    st.header("🤖 アセスメントアシスタント")

    # 支援者選択
    st.subheader("支援者を選択してください")
    # `get_clients`を再度呼び出して最新のクライアントリストを取得
    clients_for_assessment = get_clients(st.session_state.user_id) 
    selected_client = st.selectbox("支援者名:", ["--- 選択してください ---"] + clients_for_assessment, key="assessment_client_select")

    if selected_client != "--- 選択してください ---":
        st.markdown(f"### 『{selected_client}』さんのアセスメントシート更新提案")
        st.markdown("---")

        if st.button("提案を生成する", key="generate_assessment_button"):
            with st.spinner(f"『{selected_client}』さんのメモを分析中...しばらくお待ちください。"):
                recent_notes = get_notes_for_client(st.session_state.user_id, selected_client) 
                # recent_notes = get_notes_for_client(st.session_state.user_id, selected_client, days_ago=120) 

                if not recent_notes:
                    st.warning("指定された期間にメモが見つかりませんでした。")
                else:
                    st.success(f"過去120日間の**{len(recent_notes)}**件のメモを分析しました。")
                    
                    all_notes_text = ""
                    for note in recent_notes:
                        note_timestamp = datetime.fromisoformat(note['timestamp'])
                        all_notes_text += f"\n--- メモ ({note_timestamp.strftime('%Y-%m-%d %H:%M')}) ---\n"
                        all_notes_text += f"発言者: {note.get('speaker', '不明')}\n"
                        all_notes_text += f"内容: {note.get('content', '')}\n"
                        if note.get('todoItems'):
                            for todo in note['todoItems']:
                                all_notes_text += f"  TODO: {todo.get('text', '')}"
                                if todo.get('dueDate'):
                                    todo_due_date = datetime.fromisoformat(todo['dueDate'])
                                    all_notes_text += f" (期限: {todo_due_date.strftime('%Y-%m-%d')})"
                                all_notes_text += "\n"
                    
                    for main_category, sub_items in ASSESSMENT_ITEMS.items():
                        st.markdown(f"## {main_category}")
                        for item_name in sub_items:
                            st.markdown(f"### {item_name}")
                            
                            suggestion = gemini_agent.analyze(all_notes_text, item_name, ASSESSMENT_ITEMS)
                            st.text_area(f"提案 ({item_name})", value=suggestion, height=150, key=f"{selected_client}_assessment_{main_category}_{item_name}")
                            st.markdown("---")
    else:
        st.info("分析を開始するには、まず支援者を選択してください。")

st.markdown("---")
st.caption(f"App ID: {APP_ID}")
st.caption(f"User ID: {user_id_display}")
