import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp, addDoc, Timestamp, deleteDoc } from "firebase/firestore";
import ReportGenerator from "./ReportGenerator";
import ClientResources, { AssessmentDataShape } from "./ClientResources";
import MemoList, { Note as SharedNote } from "./MemoList";

interface ClientDetailProps { selectedClient: string; }
export default function ClientDetail({ selectedClient }: ClientDetailProps) {
  type TodoItem = {
  id?: string;
    text: string;
  dueDate?: { seconds: number } | string | Timestamp | null;
    isCompleted?: boolean;
  };
  type LocalNote = {
    id?: string;
    clientName?: string;
    speaker?: string;
    content?: string;
    timestamp?: { seconds: number };
    todoItems?: TodoItem[];
  };
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ id: string; speaker: string; content: string } | null>(null);

  // アセスメントと支援計画の状態
  type AssessmentItemDetail = {
    summary: string;
    sentiment: string;
  };

  type AssessmentCategory = {
    [item: string]: AssessmentItemDetail;
  };

  type AssessmentForm = {
    [category: string]: AssessmentCategory;
  };

  type AssessmentPlan = {
    id: string;
    createdAt: { seconds: number };
    assessment: {
      [form: string]: AssessmentForm;
    };
    supportPlan?: string;
    clientName: string;
  };
  const [assessmentPlan, setAssessmentPlan] = useState<AssessmentPlan | null>(null);
  const [editableSupportPlan, setEditableSupportPlan] = useState<string>("");
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [assessmentsError, setAssessmentsError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // メモ / TODO 入力用 draft state
  type TodoDraft = { id: string; text: string; dueDate: string };
  const [speaker, setSpeaker] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [todos, setTodos] = useState<TodoDraft[]>([{ id: 'initial', text: '', dueDate: '' }]);
  const addTodoField = () => setTodos(prev => [...prev, { id: Date.now().toString(), text: '', dueDate: '' }]);
  const removeTodoField = (id: string) => setTodos(prev => prev.filter(t => t.id !== id));
  const updateTodoField = (id: string, key: 'text' | 'dueDate', value: string) => setTodos(prev => prev.map(t => t.id === id ? { ...t, [key]: value } : t));
  const handleSaveClientNote = async () => {
    if (!selectedClient) return;
    if (!memoContent.trim() && todos.every(t => !t.text.trim())) return;
    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    const todoItems = todos.filter(t => t.text.trim()).map(t => ({
      id: t.id,
      text: t.text.trim(),
      dueDate: t.dueDate ? Timestamp.fromDate(new Date(t.dueDate)) : null,
      isCompleted: false
    }));
    try {
      const docRef = await addDoc(collection(db, `artifacts/${APP_ID}/users/${USER_ID}/notes`), {
        clientName: selectedClient,
        speaker: speaker.trim(),
        content: memoContent.trim(),
        todoItems,
        timestamp: Timestamp.now()
      });
      // 再取得でも良いが即時反映
      // Note 型へ合わせる (dueDate は文字列 or {seconds})
      const noteTodoItems = todoItems.map(t => ({
        text: t.text,
        dueDate: t.dueDate ? { seconds: Math.floor((t.dueDate as Timestamp).seconds ?? Date.now()/1000) } : undefined,
        isCompleted: t.isCompleted
      }));
      setNotes(prev => [{ id: docRef.id, clientName: selectedClient, speaker: speaker.trim(), content: memoContent.trim(), todoItems: noteTodoItems, timestamp: { seconds: Math.floor(Date.now()/1000) } }, ...prev]);
      setSpeaker("");
      setMemoContent("");
      setTodos([{ id: 'initial', text: '', dueDate: '' }]);
    } catch (e) {
      console.error(e);
      alert('メモ保存に失敗しました');
    }
  };

  // メモの削除
  const handleDeleteNote = async (noteId: string) => {
    try {
      const ok = typeof window === 'undefined' ? true : window.confirm('このメモを削除してもよろしいですか？');
      if (!ok) return;
      const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
      const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
      await deleteDoc(doc(db, `artifacts/${APP_ID}/users/${USER_ID}/notes`, noteId));
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) {
      console.error(e);
      alert('メモの削除に失敗しました');
    }
  };

  // タスクの完了切替
  const handleToggleTask = async (noteId: string, taskId: string, isCompleted: boolean) => {
    try {
      const note = notes.find(n => n.id === noteId);
      if (!note) return;
  const updated = (note.todoItems || []).map((t) => t?.id === taskId ? { ...t, isCompleted } : t);
      const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
      const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
      await updateDoc(doc(db, `artifacts/${APP_ID}/users/${USER_ID}/notes`, noteId), { todoItems: updated });
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, todoItems: updated } : n));
    } catch (e) {
      console.error(e);
      alert('タスクの更新に失敗しました');
    }
  };
  const simplifiedAssessment: AssessmentDataShape | null = useMemo(() => {
    if (!assessmentPlan || !assessmentPlan.assessment) return null;
    type SimplifiedCategory = Record<string, string | Record<string, string>>;
    const out: AssessmentDataShape = { assessment: {} as Record<string, SimplifiedCategory> };

    const isDetail = (obj: unknown): obj is AssessmentItemDetail => (
      typeof obj === 'object' && obj !== null &&
      'summary' in (obj as Record<string, unknown>) &&
      'sentiment' in (obj as Record<string, unknown>)
    );

    Object.entries(assessmentPlan.assessment).forEach(([form, categories]) => {
      if (!categories || typeof categories !== 'object') return;
      const formObj: Record<string, string | Record<string, string>> = {};
      Object.entries(categories).forEach(([category, items]) => {
        if (!items || typeof items !== 'object') return;
        if (isDetail(items)) {
          const summary = items.summary?.trim() || '';
          const sentiment = items.sentiment?.trim() || '';
            if (summary || sentiment) {
              formObj[category] = sentiment ? `${summary}\n(所感:${sentiment})` : summary;
            }
          return;
        }
        const catObj: Record<string, string> = {};
        Object.entries(items as AssessmentCategory).forEach(([itemKey, detail]) => {
          if (!detail || typeof detail !== 'object') return;
          const summary = detail.summary?.trim() || '';
          const sentiment = detail.sentiment?.trim() || '';
          if (summary || sentiment) {
            catObj[itemKey] = sentiment ? `${summary}\n(所感:${sentiment})` : summary;
          }
        });
        if (Object.keys(catObj).length === 1) {
          formObj[category] = Object.values(catObj)[0];
        } else if (Object.keys(catObj).length > 0) {
          formObj[category] = catObj;
        }
      });
      if (Object.keys(formObj).length > 0) {
        (out.assessment as Record<string, SimplifiedCategory>)[form] = formObj as SimplifiedCategory;
      }
    });

    if (!out.assessment || Object.keys(out.assessment).length === 0) {
      // fallback minimal form to avoid null (keeps downstream UI informative)
      out.assessment = {
        _raw: {
          dump: JSON.stringify(assessmentPlan.assessment).slice(0, 4000)
        }
      } as Record<string, SimplifiedCategory>;
    }
    return out;
  }, [assessmentPlan]);

  // 支援計画の保存ハンドラ
  const handleSaveSupportPlan = async () => {
    if (!assessmentPlan) {
      alert("保存対象のアセスメントがありません。");
      return;
    }

    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    const assessmentRef = doc(db, `artifacts/${APP_ID}/users/${USER_ID}/assessments`, assessmentPlan.id);

    try {
      await updateDoc(assessmentRef, {
        supportPlan: editableSupportPlan,
        updatedAt: serverTimestamp()
      });
      setAssessmentPlan(prev => prev ? { ...prev, supportPlan: editableSupportPlan } : null);
      alert("支援計画を保存しました。");
    } catch (error) {
      console.error("Error saving support plan: ", error);
      alert("支援計画の保存に失敗しました。");
    }
  };

  // 支援計画生成ハンドラ
  const handleGenerateSupportPlan = async () => {
    if (!assessmentPlan) return;
    setPlanLoading(true);
    setPlanError(null);
    try {
      const res = await fetch("http://localhost:8000/support-plan/generate/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessment_data: assessmentPlan }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditableSupportPlan(data.plan);
      } else {
        setPlanError(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail));
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setPlanError(error.message || "支援計画の生成中にクライアント側でエラーが発生しました。");
      } else {
        setPlanError("支援計画の生成中にクライアント側でエラーが発生しました。");
      }
    } finally {
      setPlanLoading(false);
    }
  };

  // 支援者選択時にその人のメモと最新のアセスメントを取得
  useEffect(() => {
    if (!selectedClient) {
      setNotes([]);
      setAssessmentPlan(null);
      setEditableSupportPlan("");
      return;
    }
    setLoading(true);
    setAssessmentsLoading(true);
    setAssessmentsError(null);

    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID =
      process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    
    const fetchNotes = async () => {
      const notesRef = collection(
        db,
        `artifacts/${APP_ID}/users/${USER_ID}/notes`
      );
      const q = query(notesRef, where("clientName", "==", selectedClient));
      const snap = await getDocs(q);
      setNotes(
        snap.docs.map((doc) => ({ id: doc.id, clientName: selectedClient, ...(doc.data() as LocalNote) }))
      );
      setLoading(false);
    };

    const fetchLatestAssessment = async () => {
      setAssessmentPlan(null);
      setEditableSupportPlan("");
      try {
        const assessmentsRef = collection(
          db,
          `artifacts/${APP_ID}/users/${USER_ID}/assessments`
        );
        const q = query(
          assessmentsRef,
          where("clientName", "==", selectedClient)
        );
        const snap = await getDocs(q);
        const assessments = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as AssessmentPlan[];
        
        if (assessments.length > 0) {
          // 日付でソートして最新のものを取得
          assessments.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
          const latestAssessment = assessments[0];
          setAssessmentPlan(latestAssessment);
          setEditableSupportPlan(latestAssessment.supportPlan || "");
        }
      } catch (error) {
        console.error("Error fetching assessments: ", error);
        setAssessmentsError("アセスメント情報の取得に失敗しました。");
      } finally {
        setAssessmentsLoading(false);
      }
    };

    fetchNotes();
    fetchLatestAssessment();
  }, [selectedClient]);

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full p-4">
      {/* 左カラム: メモ入力・一覧 */}
      <div className="flex-1 bg-white rounded-xl card-shadow border border-gray-100 p-6 min-w-[320px]">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">
          日々の活動メモ入力
        </h2>
        {/* メモ / TODO 入力フォーム */}
        <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="mb-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700 w-16">発言者</label>
              <input value={speaker} onChange={e=>setSpeaker(e.target.value)} placeholder="例: 本人 / 家族 / その他関係者" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <div className="flex items-center gap-1">
                <button type="button" onClick={()=>setSpeaker('本人')} className="text-xs px-2 py-1 bg-gray-200 rounded-lg hover-scale">本人</button>
                <button type="button" onClick={()=>setSpeaker('家族')} className="text-xs px-2 py-1 bg-gray-200 rounded-lg hover-scale">家族</button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">誰の発言かを明記してください（例: 本人 / 家族 / その他関係者）。</p>
          </div>
          <div className="mb-2">
            <label className="text-sm font-medium text-gray-800 block mb-1">メモ内容</label>
            <textarea value={memoContent} onChange={e=>setMemoContent(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="活動や気づき、課題など" />
          </div>
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-800">TODO（タスク化）</label>
              <button type="button" onClick={addTodoField} className="text-xs text-[var(--brand-600)] hover:underline hover-scale">＋追加</button>
            </div>
            <div className="space-y-2">
              {todos.map((t,i)=>(
                <div key={t.id} className="flex gap-2 items-center">
                  <input value={t.text} onChange={e=>updateTodoField(t.id,'text',e.target.value)} placeholder={`タスク${i+1}`} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  <input type="date" value={t.dueDate} onChange={e=>updateTodoField(t.id,'dueDate',e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  <button type="button" onClick={()=>removeTodoField(t.id)} disabled={todos.length===1} className="text-[10px] text-red-500 disabled:opacity-30 hover-scale">削除</button>
                </div>
              ))}
            </div>
          </div>
          <button disabled={!selectedClient || (!memoContent.trim() && todos.every(t=>!t.text.trim()))} onClick={handleSaveClientNote} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm py-2 rounded-lg hover-scale">保存</button>
        </div>
        {loading && <p>読み込み中...</p>}
        {selectedClient && !loading && (
          <div>
            <h3 className="text-xl font-semibold mb-3">
              {selectedClient} さんのメモ一覧
            </h3>
            <MemoList
              notes={(notes as LocalNote[]).map((n, i) => ({
                id: String(n.id ?? i),
                clientName: selectedClient,
                speaker: n.speaker,
                content: n.content,
                timestamp: n.timestamp,
                todoItems: (n.todoItems || []).map((t) => ({
                  id: t?.id,
                  text: t?.text,
                  dueDate:
                    typeof t?.dueDate === 'string'
                      ? t.dueDate
                      : (typeof t?.dueDate === 'object' && t?.dueDate && 'seconds' in t.dueDate)
                        ? { seconds: (t.dueDate as { seconds: number }).seconds }
                        : null,
                  isCompleted: t?.isCompleted,
                })),
              })) as SharedNote[]}
              onToggleTask={handleToggleTask}
              onEditNote={(note) => setEditing({ id: note.id, speaker: note.speaker || "", content: note.content || "" })}
              onDeleteNote={(noteId) => handleDeleteNote(noteId)}
            />

            {editing && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/30" onClick={() => setEditing(null)} />
                <div className="relative bg-white rounded-lg card-shadow p-4 w-[480px] max-w-[90vw] border border-gray-100">
                  <h3 className="font-semibold mb-3">メモを編集</h3>
                  <div className="mb-2">
                    <label className="text-sm text-gray-800">発言者</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-200" value={editing.speaker} onChange={(e) => setEditing({ ...editing, speaker: e.target.value })} />
                      <button type="button" className="bg-gray-200 text-xs px-2 py-1 rounded-lg hover:bg-gray-300 hover-scale" onClick={() => setEditing({ ...editing, speaker: "本人" })}>
                        本人
                      </button>
                      <button type="button" className="bg-gray-200 text-xs px-2 py-1 rounded-lg hover:bg-gray-300 hover-scale" onClick={() => setEditing({ ...editing, speaker: "家族" })}>
                        家族
                      </button>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="text-sm text-gray-800">メモ内容</label>
                    <textarea className="border border-gray-300 rounded-lg px-3 py-2 w-full mt-1 focus:outline-none focus:ring-2 focus:ring-blue-200" rows={4} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className="px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 hover-scale" onClick={() => setEditing(null)}>
                      キャンセル
                    </button>
                    <button
                      className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white hover-scale"
                      onClick={async () => {
                        try {
                          const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
                          const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
                          const { id, speaker, content } = editing;
                          await updateDoc(doc(db, `artifacts/${APP_ID}/users/${USER_ID}/notes`, id), { speaker, content });
                          setNotes((p) => p.map((n) => (n.id === id ? { ...n, speaker, content } : n)));
                          setEditing(null);
                        } catch (e) {
                          console.error(e);
                          alert('メモの更新に失敗しました');
                        }
                      }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
  {/* 右カラム: 情報・生成セクション（順序変更） */}
  <div className="flex-1 flex flex-col gap-4 min-w-[320px]">
    <div className="bg-yellow-50 rounded-xl shadow p-4">
          <h3 className="font-bold text-yellow-700 mb-2">
            アセスメントと支援計画
          </h3>
          {assessmentsLoading && <p>読み込み中...</p>}
          {assessmentsError && <p className="text-red-500">{assessmentsError}</p>}
          {!assessmentsLoading && !assessmentsError && (
            <>
              {assessmentPlan ? (
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <div className="border-b pb-2 mb-3">
                    <p className="text-sm font-semibold text-gray-600">
                      最終更新日時: {new Date(assessmentPlan.createdAt.seconds * 1000).toLocaleString()}
                    </p>
                  </div>
                  

                  {/* アセスメント内容表示 */}
                  <details className="mb-4">
                    <summary className="font-bold text-gray-800 cursor-pointer">アセスメント内容を表示</summary>
                    <div className="mt-2 space-y-3 text-sm p-3 bg-gray-50 rounded-md max-h-60 overflow-y-auto">
                      {assessmentPlan.assessment && typeof assessmentPlan.assessment === 'object' ? (
                        Object.entries(assessmentPlan.assessment).map(([form, categories]) => (
                          <div key={form}>
                            <h5 className="text-md font-bold text-gray-700 border-b pb-1 mb-2">{form}</h5>
                            <div className="space-y-2 pl-4">
                              {categories && typeof categories === 'object' ? (
                                Object.entries(categories as unknown as AssessmentCategory).map(([category, value]) => (
                                  <div key={category}>
                                    <p className="font-semibold text-gray-600">{category}</p>
                                    {value && typeof value === 'object' ? (
                                      <ul className="list-disc pl-6 text-gray-500">
                                        {Object.entries(value as AssessmentItemDetail).map(([item, details]: [string, string]) => (
                                          <li key={item}>
                                            <strong>{item}:</strong> {details || 'N/A'} 
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-gray-500">カテゴリ情報がありません。</p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : <p className="text-sm text-gray-500">アセスメントデータがありません。</p>}
                    </div>
                  </details>

                  {/* 支援計画 */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-md font-bold text-gray-800">支援計画</h4>
                      <button
                        onClick={handleGenerateSupportPlan}
                        className="bg-indigo-500 text-white px-3 py-1 rounded text-sm hover:bg-indigo-600"
                        disabled={planLoading}
                      >
                        {planLoading ? 'AIで生成中...' : 'AIで計画案を生成'}
                      </button>
                    </div>
                    {planError && <p className="text-red-500 text-sm mb-2">{planError}</p>}
                    <textarea
                      value={editableSupportPlan}
                      onChange={(e) => setEditableSupportPlan(e.target.value)}
                      className="w-full border border-gray-200 p-2 rounded mt-1 text-sm"
                      rows={15}
                      placeholder="ここに支援計画を入力・編集してください。"
                    />
                    <button
                      onClick={handleSaveSupportPlan}
                      className="w-full mt-2 bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600"
                    >
                      この計画を保存
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {selectedClient ? "保存されたアセスメントはありません。" : "支援者を選択してください。"}
                </p>
              )}
            </>
          )}
        </div>
        {/* ClientResources: pass simplified assessment for suggestions (may be null if no data) */}
        <div className="bg-white rounded-xl shadow p-0">
          <ClientResources clientName={selectedClient || null} hasAssessmentPlan={!!assessmentPlan} assessmentData={simplifiedAssessment} />
        </div>
        <div className="bg-purple-50 rounded-xl shadow p-4">
          <h3 className="font-bold text-purple-700 mb-2">
            活動報告書・支払い報告書生成
          </h3>
          <p className="text-sm text-gray-700 mb-2">
            選択中の支援対象者のメモに基づき、報告書を生成します。
          </p>
          <ReportGenerator
            selectedClient={selectedClient}
            hasAssessment={!!assessmentPlan}
            memos={notes.map((n) => ({
              ...n,
              content: n.content ?? "",
              timestamp:
                n.timestamp?.seconds !== undefined
                  ? {
                      toDate: () =>
                        new Date((n.timestamp?.seconds ?? 0) * 1000),
                    }
                  : undefined,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
