import os
import sys
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables from .env file
# The .env file is expected to be in the `application` directory
dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path)


# Add the application directory to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from google.cloud.firestore import SERVER_TIMESTAMP
from infra.firestore import get_firestore_client
import config

db = get_firestore_client()


def seed_data():
    """
    Firestoreにデモデータを投入する
    """
    try:
        print("Seeding data...")

        # --- Clean up existing data ---
        # Deleting notes, clients, and interview_records.
        print("Cleaning up existing demo data (clients, notes, interview_records)...")
        delete_collection(
            db.collection("artifacts")
            .document(config.TARGET_FIREBASE_APP_ID)
            .collection("users")
            .document(config.TARGET_FIREBASE_USER_ID)
            .collection("clients")
        )
        delete_collection(
            db.collection("artifacts")
            .document(config.TARGET_FIREBASE_APP_ID)
            .collection("users")
            .document(config.TARGET_FIREBASE_USER_ID)
            .collection("notes")
        )
        delete_collection(
            db.collection("artifacts")
            .document(config.TARGET_FIREBASE_APP_ID)
            .collection("users")
            .document(config.TARGET_FIREBASE_USER_ID)
            .collection("interview_records")
        )
        print("Existing data cleaned up.")

        # --- Clients (Supporters) ---
        clients = [
            {"id": "client-1", "name": "テスト 一郎"},
            {"id": "client-2", "name": "テスト 花子"},
            {"id": "client-3", "name": "テスト 三郎"},
            {"id": "client-4", "name": "テスト さくら"},
            {"id": "client-5", "name": "テスト 正敏"},
        ]
        # --- Scenarios for Interview Records (Notes), Memos (short notes), and Tasks (TodoItems) ---
        scenarios = [
            {
                "client_name": "テスト 一郎",
                "interview_record": "社会福祉士: こんにちは、テストさん。市役所の紹介でお越しいただいたと伺っています。本日はどうぞ、よろしくお願いします。\nテスト 一郎（75歳）: あいやー、わざわざすまねぇな。よろしくお願いします。\n社会福祉士: まずは、ご住所の確認からさせていただけますか？\nテスト 一郎: おう、わがった。住所はな、山形県上山市金瓶（かなかめ）の…えーっと、何番地だったかな。最近、物忘れがひどくてな。\n社会福祉士: 大丈夫ですよ、ゆっくりで。こちらに書類がありますので、一緒に確認しましょうか。…上山市金瓶の3-15で間違いないですか？\nテスト 一郎: ああ、そうだそうだ。それだ。助かるなや。\n社会福祉士: とんでもないです。では、今日はいろいろとお話を伺えればと思います。市役所の方からは、最近お金の管理が少し大変になってきたと伺いましたが、具体的にどんなことでお困りですか？\nテスト 一郎: そうなんだ。年金暮らしでな、やりくりが大変で。それに、最近は銀行に行ってお金をおろすのも億劫でな。通帳がどこさいったか分からなくなることもあるんだ。\n社会福祉士: そうでしたか。それはご不便ですね。お金の管理や、大切な書類を失くしてしまう不安があるんですね。実は、私どもの社会福祉協議会では、「日常生活自立支援事業」というサービスがあるんですよ。例えば、預金の出し入れのお手伝いをしたり、公共料金の支払いを代行したりできるんです。ご興味ありますか？\nテスト 一郎: ほう、そんげな便利なものがあるんだな。それは助かるかもしれねぇ。でも、お金のことだから、ちょっと心配だなや。\n社会福祉士: ご心配はもっともです。この事業は、ご本人との契約に基づいて行いますし、専門の職員が担当しますのでご安心ください。今日はまず、どんなサービスか説明だけでも聞いてみませんか？\nテスト 一郎: そうだな。まずは話だけでも聞いてみるかな。あと、最近よく分からん電話がかかってくんだ。「あんたの年金が…」とか言ってな。これも相談できるんだべか？\n社会福祉士: もちろんです。そういったお電話のことも、一緒に対応を考えることができますよ。成年後見制度という別の制度のご紹介もできますし、まずは一番ご心配なことから整理していきましょう。\nテスト 一郎: あとついでに聞きたいんだが、近所の斎藤さん、足が悪くて買い物に行けなくて困ってるんだ。そういうのも、何か手伝ってもらえるもんだべか？\n社会福祉士: 斎藤さんのことまで気にかけていらっしゃるんですね。素晴らしいです。はい、買い物支援のサービスもありますよ。地域には色々なサービスがありますから、テストさんご自身のことも、ご近所の方のことも、何か困ったことがあったら、まずはここに相談していただければ大丈夫です。\nテスト 一郎: そうか、そうか。なんだか、いっぺんに話してすまねぇな。でも、少し安心したなや。\n社会福祉士: いいえ、とんでもないです。一つずつ、一緒に考えていきましょう。まずは、先ほどの日常生活自立支援事業のパンフレットをご覧になりますか？",
                "memos_and_tasks": [
                    {
                        "memo": "日常生活自立支援事業の利用について初回面談。パンフレットを渡し、サービス内容を説明。本人は前向きに検討したいとのこと。",
                        "task": "次回訪問時に、日常生活自立支援事業の契約意思を再確認",
                    },
                    {
                        "memo": "最近かかってくる不審な電話についてヒアリング。消費者センターの連絡先を伝え、注意喚起を行った。",
                        "task": "成年後見制度に関する情報提供資料の準備",
                    },
                    {
                        "memo": "近所の斎藤様の買い物支援について相談あり。地域の配食サービスや移動販売の情報を整理して提供することを約束。",
                        "task": "斎藤様宅への訪問アポイントメント調整",
                    },
                ],
            },
            {
                "client_name": "テスト 花子",
                "interview_record": "社会福祉士: テストさん、こんにちは。お電話ありがとうございます。ご住所は山形県鶴岡市末広町3-1でよろしかったでしょうか？\nテスト 花子（32歳）: はい、そうです。\n社会福祉士: ありがとうございます。本日はどのようなご相談でしょうか？\nテスト 花子: 育児と仕事の両立で悩んでいます。5歳の息子に少し発達の遅れがあって、パートの時間を増やしたいのですが、預け先が見つからなくて…。\n社会福祉士: そうだったのですね。お子さんのこともご心配でしょう。地域の子育て支援センターや一時預かりサービスの情報提供ができますし、発達について相談できる専門機関と連携することも可能です。一緒に考えていきましょう。",
                "memos_and_tasks": [
                    {"memo": "子育て支援センターに同行。一時預かりの登録を完了。", "task": "来週の一時預かりの予約"},
                    {
                        "memo": "発達支援の専門機関に電話で初回相談。次回の面談を設定。",
                        "task": "専門機関との面談に同席",
                    },
                    {
                        "memo": "ハローワークのマザーズコーナーから、時間に融通の利くパート求人情報を数件入手し、情報提供。",
                        "task": "テスト花子様と求人情報の検討会",
                    },
                    {
                        "memo": "保育園の担任と面談。長男の園での様子について情報共有。",
                        "task": "担任との定期的な連絡会の設定",
                    },
                ],
            },
            {
                "client_name": "テスト 三郎",
                "interview_record": "社会福祉士: テストさん、こんにちは。ご自宅へお伺いしました。ご住所は山形県酒田市幸町1-10-1ですね。\nテスト 三郎（78歳）: はい、わざわざすみません。\n社会福祉士: とんでもないです。お体の具合はいかがですか？\nテスト 三郎: 1ヶ月前に家で転んでから、一人での生活が不安でね。買い物や掃除も億劫になってしまって。\n社会福祉士: それはご心配ですね。よろしければ、介護保険の申請のお手伝いをさせていただけませんか？地域包括支援センターと連携して進めます。また、近所の高齢者サロンなど、少し気分転換になるような場所の情報もありますよ。",
                "memos_and_tasks": [
                    {
                        "memo": "地域包括支援センターの担当者と自宅を訪問。介護保険の申請手続きを完了。",
                        "task": "介護認定調査の立ち会い日程調整",
                    },
                    {
                        "memo": "近所の高齢者サロンに一緒に行き、活動を見学。本人は少し興味を持った様子。",
                        "task": "来週のサロン活動への参加を再度声かけ",
                    },
                    {
                        "memo": "シルバー人材センターに連絡し、庭の手入れを依頼。",
                        "task": "シルバー人材センターの作業日の確認",
                    },
                ],
            },
            {
                "client_name": "テスト さくら",
                "interview_record": "社会福祉士: もしもし、テストさんですか？お電話ありがとうございます。ご住所は山形県新庄市沖ノ町10-37でお間違いないでしょうか？\nテスト さくら（22歳）: …はい。\n社会福祉士: お声が聞けて嬉しいです。お変わりありませんか？\nテスト さくら: …あまり。大学を辞めてから2年くらい、ほとんど外に出ていなくて。人と話すのが怖くて…。\n社会福祉士: そうだったんですね。お電話でお話しするのも勇気がいったと思います。ありがとうございます。まずは、定期的にお電話やメールでお話しすることから始めませんか？同じ悩みを持つ若い人たちのグループもありますので、もし興味があれば、情報をお送りしますよ。",
                "memos_and_tasks": [
                    {
                        "memo": "週1回の定期的な電話連絡を開始。少しずつ会話が続くようになってきた。",
                        "task": "次回の電話で話すテーマを準備（趣味など）",
                    },
                    {
                        "memo": "ひきこもり地域支援センターのオンライン相談に、一緒に参加。本人はチャットでの参加だったが、大きな一歩。",
                        "task": "オンライン相談の感想を聞く",
                    },
                    {
                        "memo": "本人の希望で、好きなアニメの話題についてメールでやり取り。少し元気が出てきた様子。",
                        "task": "おすすめのアニメについて情報収集",
                    },
                ],
            },
            {
                "client_name": "テスト 正敏",
                "interview_record": "社会福祉士: テストさん、こんにちは。本日はお越しいただきありがとうございます。まず、ご住所を確認させてください。山形県寒河江市中央1-9-45ですね。\nテスト 正敏（55歳）: はい、そうです。\n社会福祉士: ありがとうございます。それでは、ご相談内容をお聞かせいただけますか？\nテスト 正敏: 実は、自営業に失敗してしまって、多額の借金を抱えています。今は日雇いの仕事でなんとか食いつないでいますが、返済に追われて生活が苦しくて…。\n社会福祉士: 大変な状況ですね。お一人で抱え込まず、相談してくださってありがとうございます。債務の問題については、法テラスのような専門機関に繋ぐことができます。予約のサポートもしますので、ご安心ください。生活再建に向けて、一緒に計画を立てていきましょう。",
                "memos_and_tasks": [
                    {
                        "memo": "法テラスの無料法律相談に同行。弁護士から自己破産についての説明を受ける。",
                        "task": "自己破産の申立に必要な書類リストを作成",
                    },
                    {
                        "memo": "家計簿のつけ方を一緒に確認。まずは1週間の収支を記録することから始める。",
                        "task": "来週、家計簿の内容を一緒に確認",
                    },
                    {
                        "memo": "精神的な負担が大きいため、カウンセリングの利用を提案。地域の相談窓口を情報提供。",
                        "task": "カウンセリングの予約をサポート",
                    },
                    {
                        "memo": "日雇いの仕事のシフトについて聞き取り。収入の安定化に向けた方策を検討。",
                        "task": "安定した就労に向けた支援計画の立案",
                    },
                ],
            },
        ]

        # --- Create Clients ---
        print("Creating clients...")
        for client in clients:
            db.collection("artifacts").document(config.TARGET_FIREBASE_APP_ID).collection("users").document(
                config.TARGET_FIREBASE_USER_ID
            ).collection("clients").add({"name": client["name"], "createdAt": SERVER_TIMESTAMP})
        print(f"{len(clients)} clients created.")

        # --- Create Interview Records, Memos (short notes) and Tasks (TodoItems) ---
        print("Creating interview records, notes, memos, and tasks...")
        notes_created_count = 0
        interview_records_created_count = 0
        for scenario in scenarios:
            client_name = scenario["client_name"]

            # 1. Create the main interview record in its own collection
            db.collection("artifacts").document(config.TARGET_FIREBASE_APP_ID).collection("users").document(
                config.TARGET_FIREBASE_USER_ID
            ).collection("interview_records").add(
                {
                    "clientName": client_name,
                    "content": scenario["interview_record"],
                    "speaker": "本人",
                    "timestamp": datetime.now() - timedelta(days=random.randint(31, 60)),
                }
            )
            interview_records_created_count += 1

            # 2. Create several shorter memos (as notes) with their own tasks
            for i, memo_task in enumerate(scenario["memos_and_tasks"]):
                speaker = "本人"
                task = {
                    "id": os.urandom(8).hex(),
                    "text": memo_task["task"],
                    "dueDate": (datetime.now() + timedelta(days=random.randint(1, 15))).strftime("%Y-%m-%d"),
                    "isCompleted": random.choice([True, False]),
                }
                db.collection("artifacts").document(config.TARGET_FIREBASE_APP_ID).collection("users").document(
                    config.TARGET_FIREBASE_USER_ID
                ).collection("notes").add(
                    {
                        "clientName": client_name,
                        "content": f"{memo_task['memo']}",
                        "speaker": speaker,
                        "timestamp": datetime.now()
                        - timedelta(days=random.randint(1, 30 - i * 5)),  # Ensure memos are more recent
                        "todoItems": [task],
                    }
                )
                notes_created_count += 1

        print(f"{interview_records_created_count} interview records created.")
        print(f"{notes_created_count} notes (memos) with tasks created.")

        print("Seeding completed successfully!")

    except Exception as e:
        print(f"An error occurred during seeding: {e}")
        import traceback

        traceback.print_exc()


def delete_collection(coll_ref, batch_size=50):
    """
    コレクション内のすべてのドキュメントを削除する
    """
    docs = coll_ref.limit(batch_size).stream()
    deleted = 0

    for doc in docs:
        doc.reference.delete()
        deleted += 1

    if deleted >= batch_size:
        return delete_collection(coll_ref, batch_size)


if __name__ == "__main__":
    seed_data()
