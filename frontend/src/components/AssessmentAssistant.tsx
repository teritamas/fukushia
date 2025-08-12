import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

export default function AssessmentAssistant() {
  const [assessmentResult, setAssessmentResult] = useState("");
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [mappedResult, setMappedResult] = useState<any>(null);
  const [script, setScript] = useState(`支援者（田中 健一、45歳）: 相談に来て、少し緊張しています。よろしくお願いします。

社会福祉士: 田中さん、本日はお越しいただきありがとうございます。どうぞ、楽にお話しください。本日はどのようなことでお困りでしょうか？

田中: ええと...実は、数年前に会社をリストラされてから、ずっと仕事が見つからないんです。年齢のせいか、書類選考で落ちてしまうことが多くて。最初は頑張ろうと思っていたんですが、最近はもうどうしていいか分からなくなってしまって...。

社会福祉士: そうですか、それは大変でしたね。これまで、どのようなお仕事をされていましたか？

田中: 以前は、小さな町工場で旋盤工をしていました。勤続20年で、機械の扱いには自信があります。細かい作業も得意で、手先は器用な方だと思います。ただ、パソコンはほとんど使ったことがなくて...。

社会福祉士: 旋盤工として20年も経験を積んでこられたのですね。それは素晴らしい強みです。仕事を探す上で、何か希望はありますか？

田中: できれば、また製造業に関わる仕事に就きたいです。でも、今の状況だと、清掃や警備の仕事でも、とにかく安定した収入が欲しいと思っています。

社会福祉士: 収入面での不安が大きいとのこと、承知いたしました。生活のことでお困りごとはありますか？

田中: 家賃の支払いが厳しくなってきていて、貯金もほとんど底をつきました。食事もまともにとれていない日があって、体調もすぐれません。このままだと、家を追い出されてしまうんじゃないかと不安です...。

社会福祉士: 生活の基盤が不安定な状況なのですね。お話しいただきありがとうございます。一つずつ、一緒に解決策を考えていきましょう。ご家族はいらっしゃいますか？

田中: 離婚して、今は一人暮らしです。遠方に住んでいる母親がいますが、高齢なので心配はかけたくありません。

社会福祉士: 承知いたしました。本日はたくさんお話しいただきありがとうございました。本日お伺いした内容を元に、まずは生活を安定させるための支援と、田中さんの得意なことを活かせる就労支援について、一緒に計画を立てていきましょう。`);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  // Firestoreから支援者一覧を取得
  useEffect(() => {
    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID =
      process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    const fetchClients = async () => {
      const ref = collection(
        db,
        `artifacts/${APP_ID}/users/${USER_ID}/clients`
      );
      const snap = await getDocs(ref);
      setClients(snap.docs.map((doc) => doc.data().name));
    };
    fetchClients();
  }, []);

  // Gemini API連携（Pythonバックエンド呼び出し）
  const handleAssessment = async () => {
    if (!selectedClient) {
      setAssessmentError("支援者を選択してください");
      return;
    }
    setAssessmentLoading(true);
    setAssessmentError(null);
    setAssessmentResult("");
    try {
      const APP_ID =
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
      const USER_ID =
        process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
      const notesRef = collection(
        db,
        `artifacts/${APP_ID}/users/${USER_ID}/notes`
      );
      const q = query(notesRef, where("clientName", "==", selectedClient));
      const snap = await getDocs(q);
      const notes = snap.docs.map((doc) => doc.data());
      const text = notes
        .map((n) =>
          [
            n.speaker,
            n.content,
            ...(n.todoItems?.map((t: { text: string }) => t.text) || []),
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n---\n");
      const assessment_item_name = "項目名"; // 必要に応じて
      const user_assessment_items = {}; // 必要に応じて
      const res = await fetch("http://localhost:8000/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          assessment_item_name,
          user_assessment_items,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAssessmentResult(data.result);
      } else {
        setAssessmentError(data.error || "APIエラー");
      }
    } catch {
      setAssessmentError("AI提案の取得に失敗しました");
    } finally {
      setAssessmentLoading(false);
    }
  };

  const handleMapAssessment = async () => {
    setMappingLoading(true);
    setMappingError(null);
    setMappedResult(null);
    try {
      const items = { /* アセスメント項目 */ }; // 実際には定義済みの構造を使用

      const res = await fetch("http://localhost:8000/assessment/map/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_content: script,
          assessment_items: items,
        }),
      });
      const data = await res.json();
      setMappedResult(data);
    } catch {
      setMappingError("マッピング処理に失敗しました");
    } finally {
      setMappingLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">アセスメント自動提案</h2>
      <div className="mb-4">
        <label className="font-bold mr-2">支援者を選択：</label>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="border px-2 py-1 rounded"
        >
          <option value="">-- 支援者を選択 --</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <button
        className="bg-green-500 text-white px-4 py-2 rounded mb-4"
        onClick={handleAssessment}
        disabled={assessmentLoading || !selectedClient}
      >
        AIに提案してもらう
      </button>
      {assessmentLoading && <p>AI提案を生成中...</p>}
      {assessmentError && <p className="text-red-500">{assessmentError}</p>}
      {assessmentResult && (
        <div className="bg-gray-100 rounded p-4 whitespace-pre-wrap mt-2">
          {assessmentResult}
        </div>
      )}
      <hr className="my-8" />
      <div>
        <h2 className="text-xl font-semibold mb-4">
          面談記録からアセスメント項目を自動入力
        </h2>
        <div className="mb-4">
          <label htmlFor="script-textarea" className="font-bold mb-2 block">
            面談記録（スクリプト）
          </label>
          <textarea
            id="script-textarea"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={15}
            className="w-full border p-2 rounded"
            placeholder="ここに面談記録を貼り付けてください..."
          />
        </div>
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded mb-4 hover:bg-blue-600 disabled:bg-blue-300"
          onClick={handleMapAssessment}
          disabled={mappingLoading}
        >
          {mappingLoading ? "マッピング中..." : "アセスメント項目にマッピング"}
        </button>
        {mappingError && <p className="text-red-500">{mappingError}</p>}
        {mappedResult && (
          <div className="bg-gray-100 rounded p-4 mt-4">
            <h3 className="text-lg font-bold mb-2">マッピング結果</h3>
            <pre className="whitespace-pre-wrap text-sm">
              {JSON.stringify(mappedResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
