import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, Timestamp, getDocs, query, where, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { assessmentItems } from "../lib/assessmentItems";
import { useClientContext } from "./ClientContext";

export default function AssessmentAssistant() {
  const [assessmentResult] = useState("");
  const [assessmentLoading] = useState(false);
  const [assessmentError] = useState<string | null>(null);
  const { currentClient } = useClientContext();
  type MappedResult = Record<string, Record<string, string | Record<string, string>>>;
  const [mappedResult, setMappedResult] = useState<MappedResult | null>(null);
  const [existingAssessment, setExistingAssessment] = useState<MappedResult | null>(null);
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingError, setExistingError] = useState<string | null>(null);
  const [showCreation, setShowCreation] = useState(false); // まだ保存が無いときに作成フローを開くか
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
  
  // 支援者一覧取得と選択は親コンポーネント(ClientWorkspace)で管理

  const handleMapAssessment = async () => {
    if (!script.trim()) {
      setMappingError("スクリプトを入力してください。");
      return;
    }
    setMappingLoading(true);
    setMappingError(null);
    setMappedResult(null);

    try {
      // 取得した項目とスクリプトで自動整理を実行
      const mapRes = await fetch("http://localhost:8000/assessment/map/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_content: script,
          assessment_items: assessmentItems,
        }),
      });
      const mapData = await mapRes.json();
      if (mapRes.ok) {
        setMappedResult(mapData);
      } else {
        setMappingError(mapData.detail || "自動整理に失敗しました。");
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setMappingError(error.message || "APIへの接続中にエラーが発生しました。");
      } else {
        setMappingError("APIへの接続中にエラーが発生しました。");
      }
    } finally {
      setMappingLoading(false);
    }
  };

  const handleResultChange = (form: string, category: string, subCategory: string | null, value: string) => {
    setMappedResult((prev: MappedResult | null) => {
      const newResult = { ...prev };
      if (subCategory) {
        if (typeof newResult[form][category] === "object" && newResult[form][category] !== null) {
          (newResult[form][category] as Record<string, string>)[subCategory] = value;
        }
      } else {
        newResult[form][category] = value;
      }
      return newResult;
    });
  };

  const handleSaveAssessment = async () => {
  if (!currentClient) {
      setMappingError("結果を保存する支援者を選択してください。");
      return;
    }
    if (!mappedResult) {
      setMappingError("保存するデータがありません。");
      return;
    }
    // Firestoreに保存
    try {
      const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
      const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
      const docRef = await addDoc(collection(db, `artifacts/${APP_ID}/users/${USER_ID}/assessments`), {
        clientName: currentClient.name,
        assessment: mappedResult,
        originalScript: script,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      // 保存後は既存表示モードへ移行
      setExistingAssessment(mappedResult);
      setMappedResult(null);
      alert(`アセスメント結果が保存されました。 (ID: ${docRef.id})`);
    } catch (error) {
      console.error("Error saving assessment: ", error);
      setMappingError("アセスメント結果の保存に失敗しました。");
    }
  };

  // 既存アセスメント読込
  useEffect(()=>{
    const loadExisting = async () => {
      if (!currentClient) { setExistingAssessment(null); return; }
      setExistingLoading(true); setExistingError(null);
      try {
        const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
        const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
        const ref = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/assessments`);
        const qAssess = query(ref, where('clientName','==', currentClient.name));
        const snap = await getDocs(qAssess);
        if (snap.empty) { setExistingAssessment(null); }
        else {
            interface RawDoc { id: string; createdAt?: { seconds?: number } | null; assessment?: MappedResult | null }
            const docs = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...(d.data() as DocumentData) })) as RawDoc[];
            docs.sort((a,b)=> ((b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
            setExistingAssessment(docs[0]?.assessment ?? null);
        }
  } catch(e) {
        console.error(e);
        setExistingError('既存アセスメントの取得に失敗しました');
      } finally {
        setExistingLoading(false);
      }
    };
    loadExisting();
  }, [currentClient]);

  // 既存があれば読み取り専用表示
  if (existingAssessment) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">保存済みアセスメント</h2>
        {currentClient && (
          <div className="text-sm text-gray-700 mb-3">対象支援者: <span className="font-semibold">{currentClient.name}</span></div>
        )}
        {existingLoading && <p className="text-xs text-gray-500">読み込み中...</p>}
        {existingError && <p className="text-xs text-red-500">{existingError}</p>}
        {!existingLoading && !existingError && (
          <div className="space-y-10">
            {Object.entries(existingAssessment)
              .sort((a,b)=>{
                const order = (name:string)=>{
                  if (name.startsWith('様式1')) return 0;
                  if (name.startsWith('様式2')) return 1;
                  return 10; // fallback later forms
                };
                const oa = order(a[0]);
                const ob = order(b[0]);
                if (oa!==ob) return oa-ob;
                return a[0].localeCompare(b[0], 'ja');
              })
              .map(([form, categories]) => (
              <div key={form} className="border rounded bg-white shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">{form}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {Object.entries(categories as Record<string, string | Record<string, string>>).map(([category, value]) => (
                    <div key={category} className="text-sm flex flex-col">
                      <p className="font-semibold text-gray-700 mb-1">{category}</p>
                      {typeof value === 'string' ? (
                        <div className="bg-gray-50 border rounded p-2 whitespace-pre-wrap leading-relaxed text-gray-800 min-h-[3rem]">{value || '—'}</div>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(value as Record<string,string>).map(([sub, subVal]) => (
                            <div key={sub} className="border rounded bg-gray-50 p-2">
                              <p className="text-[11px] font-semibold text-gray-500 mb-1">{sub}</p>
                              <div className="whitespace-pre-wrap leading-relaxed text-gray-800 text-[12px]">{subVal || '—'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {!showCreation && (
        <div className="mb-6 border rounded p-6 bg-gray-50 text-center space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">保存されたアセスメントはありません</h2>
          <p className="text-sm text-gray-600">初回アセスメントを作成してください。AI が面談記録を解析して各項目へ自動整理します。</p>
          <div>
            <button
              onClick={()=> setShowCreation(true)}
              disabled={!currentClient}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm shadow inline-flex items-center gap-1"
            >
              {currentClient ? 'AIでアセスメントを作成' : '支援者を選択してください'}
            </button>
          </div>
        </div>
      )}
      {showCreation && <h2 className="text-xl font-semibold mb-4">面談記録からアセスメント項目を自動入力</h2>}
      <div className="mb-4">
        {currentClient ? (
          <div className="text-sm text-gray-700">対象支援者: <span className="font-semibold">{currentClient.name}</span></div>
        ) : (
          <div className="text-sm text-red-600">支援者が選択されていません。上部で支援者を選択してください。</div>
        )}
      </div>
      {showCreation && (
        <>
        {assessmentLoading && <p>AI提案を生成中...</p>}
        {assessmentError && <p className="text-red-500">{assessmentError}</p>}
        {assessmentResult && (
          <div className="bg-gray-100 rounded p-4 whitespace-pre-wrap mt-2">
            {assessmentResult}
          </div>
        )}
        <div>
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
          disabled={mappingLoading || !currentClient}
        >
          {mappingLoading ? "反映中..." : currentClient ? "アセスメント項目へ反映" : "支援者を選択してください"}
        </button>
        {mappingError && <p className="text-red-500 mb-4">{mappingError}</p>}

  {mappedResult ? (
          // 結果表示・編集UI
          <div className="grid grid-cols-2 gap-8 mt-4">
            {/* 左側：元のスクリプト */}
            <div>
              <h3 className="text-lg font-bold mb-2">元の面談記録</h3>
              <div className="bg-gray-50 rounded p-4 h-full overflow-auto text-sm">
                <pre className="whitespace-pre-wrap">{script}</pre>
              </div>
            </div>

            {/* 右側：編集可能なアセスメント項目 */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold">AIによるアセスメント（編集可能）</h3>
                <button
                  onClick={handleSaveAssessment}
                  className="bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600"
                >
                  この内容で保存
                </button>
              </div>
              <div className="space-y-6">
                {Object.entries(mappedResult).map(([form, categories]) => (
                  <div key={form}>
                    <h4 className="text-md font-bold text-gray-700 border-b-2 border-gray-200 pb-1 mb-2">{form}</h4>
                    <div className="space-y-4">
                      {Object.entries(categories as Record<string, string | Record<string, string>>).map(([category, value]) => (
                        <div key={category}>
                          <label className="text-sm font-semibold text-gray-600">{category}</label>
                          {typeof value === 'string' ? (
                            <textarea
                              value={value}
                              onChange={(e) => handleResultChange(form, category, null, e.target.value)}
                              className="w-full border p-2 rounded mt-1 text-sm"
                              rows={3}
                            />
                          ) : (
                            <div className="pl-4 mt-1 space-y-2 border-l-2">
                              {Object.entries(value as Record<string, string>).map(([subCategory, subValue]) => (
                                <div key={subCategory}>
                                  <label className="text-sm font-semibold text-gray-500">{subCategory}</label>
                                  <textarea
                                    value={subValue as string}
                                    onChange={(e) => handleResultChange(form, category, subCategory, e.target.value)}
                                    className="w-full border p-2 rounded mt-1 text-sm"
                                    rows={2}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // 初期表示（自動整理前）
          <div className="bg-gray-100 rounded p-4 mt-4">
            <p className="text-center text-gray-500">
              上記に面談記録を入力し、「アセスメント項目へ反映」ボタンを押してください。
            </p>
          </div>
        )}
        </div>
        </>
      )}
    </div>
  );
}
