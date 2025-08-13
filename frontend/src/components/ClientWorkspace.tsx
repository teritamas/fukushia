"use client";
import React, { useEffect, useState } from 'react';
import ClientDetail from './ClientDetail';
import AssessmentAssistant from './AssessmentAssistant';
import { db } from '../firebase';
import { collection, addDoc, getDocs, Timestamp, query, where, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { useClientContext, ClientData } from './ClientContext';

// ClientWorkspace will become the central hub for managing a client.
// For now, it will just have tabs to switch between client details and assessment.
export default function ClientWorkspace() {
  const [activeTab, setActiveTab] = useState<'detail' | 'assessment'>('detail');
  const { currentClient, setCurrentClient } = useClientContext();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  // 個別基本情報はアセスメントの本人情報を参照
  const [personalInfo, setPersonalInfo] = useState<Record<string,string>>({});
  const [prevPersonalInfo, setPrevPersonalInfo] = useState<Record<string,string> | null>(null);
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const [hasAssessment, setHasAssessment] = useState(false);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'default-app-id';
  const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || 'test-user';

  useEffect(() => {
    const fetchClients = async () => {
      setLoading(true);
      try {
        const ref = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/clients`);
        const snap = await getDocs(ref);
        const list: ClientData[] = snap.docs.map(d => ({ id: d.id, name: d.data().name, photoUrl: d.data().photoUrl, basicInfo: d.data().basicInfo }));
        setClients(list);
        if (!currentClient && list.length > 0) setCurrentClient(list[0]);
      } finally {
        setLoading(false);
      }
    };
    fetchClients();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, `artifacts/${APP_ID}/users/${USER_ID}/clients`), { name: newName.trim(), photoUrl: newPhotoUrl.trim() || null, createdAt: Timestamp.now() });
      const data: ClientData = { id: docRef.id, name: newName.trim(), photoUrl: newPhotoUrl.trim() || undefined };
      setClients(prev => [...prev, data]);
      setCurrentClient(data);
      setNewName('');
      setNewPhotoUrl('');
    } finally {
      setAdding(false);
    }
  };

  // 写真URL更新フォームは不要のため機能削除

  // 最新アセスメントから本人情報抽出
  useEffect(()=>{
    const loadPersonal = async () => {
      if (!currentClient) { setPersonalInfo({}); return; }
      setPersonalLoading(true); setPersonalError(null);
      try {
        const assessmentsRef = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/assessments`);
        const qAssess = query(assessmentsRef, where('clientName','==', currentClient.name));
        const snap = await getDocs(qAssess);
  type RawAssessment = { id: string; createdAt?: { seconds?: number }; assessment?: Record<string, unknown> };
  const assessments: RawAssessment[] = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...(d.data() as DocumentData) }));
        setHasAssessment(assessments.length > 0);
        if (assessments.length === 0) {
          setPersonalInfo({});
          setPrevPersonalInfo(null);
          setChangedKeys(new Set());
          return;
        }
        assessments.sort((a,b)=> (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
        const latest = assessments[0];
        const previous = assessments.length > 1 ? assessments[1] : null;
        const extractPersonal = (assessmentDoc: RawAssessment | null) => {
          if (!assessmentDoc) return null;
          const assessData = (assessmentDoc.assessment || {}) as Record<string, unknown>;
          for (const formKey of Object.keys(assessData)) {
            const formObj = assessData[formKey];
            if (formObj && typeof formObj === 'object' && (formObj as Record<string, unknown>)['本人情報']) {
              return (formObj as Record<string, unknown>)['本人情報'] as Record<string, unknown>;
            }
          }
          return null;
        };
        const latestSection = extractPersonal(latest);
        const prevSection = extractPersonal(previous);
  const fields = ['電話番号','生年月日','同居状況','現住所','住民票','住居形態','性別'];
    type SummaryLike = { summary?: unknown };
    const extract = (val: unknown): string => {
          if (val == null) return '';
            if (typeof val === 'string') return val;
            if (typeof val === 'object') {
      if ((val as SummaryLike).summary && typeof (val as SummaryLike).summary === 'string') return (val as SummaryLike).summary as string;
              return JSON.stringify(val);
            }
            return String(val);
        };
        const latestInfo: Record<string,string> = {};
        const prevInfo: Record<string,string> = {};
        for (const f of fields) {
          latestInfo[f] = latestSection ? extract(latestSection[f]) : '';
          prevInfo[f] = prevSection ? extract(prevSection[f]) : '';
        }
        // Compute changed keys (ignore empty vs empty)
        const diff = new Set<string>();
        if (previous) {
          for (const f of fields) {
            if (latestInfo[f] !== prevInfo[f] && !(latestInfo[f] === '' && prevInfo[f] === '')) diff.add(f);
          }
        }
        setPersonalInfo(latestInfo);
        setPrevPersonalInfo(previous ? prevInfo : null);
        setChangedKeys(diff);
  } catch {
        setPersonalError('本人情報の取得に失敗しました');
      } finally {
        setPersonalLoading(false);
      }
    };
    loadPersonal();
  }, [currentClient, APP_ID, USER_ID]);

  return (
    <div className="space-y-6">
      {/* Selector Panel */}
      <section className="bg-white border rounded-lg p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">支援者選択</h2>
        {loading ? <p className="text-xs text-gray-500">読込中...</p> : (
          <div className="flex flex-wrap gap-3 mb-4">
            {clients.map(c => (
              <button key={c.id} onClick={()=> setCurrentClient(c)} className={`flex items-center gap-2 px-3 py-2 rounded border text-xs ${currentClient?.id===c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 hover:bg-gray-100'}`}>
                <span className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center text-[11px] font-medium">
                  {c.photoUrl ? <img src={c.photoUrl} alt={c.name} className="w-full h-full object-cover" /> : c.name.slice(0,2)}
                </span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mb-2">
          {!showAddForm && (
            <button onClick={()=>setShowAddForm(true)} className="text-xs px-3 py-1 bg-blue-600 text-white rounded">新しい支援者を追加</button>
          )}
          {showAddForm && (
            <div className="mt-2 space-y-2 border rounded p-3 bg-gray-50">
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="氏名" className="border rounded px-2 py-1 text-sm flex-1" />
                <input value={newPhotoUrl} onChange={e=>setNewPhotoUrl(e.target.value)} placeholder="写真URL (任意)" className="border rounded px-2 py-1 text-sm flex-1" />
              </div>
              <div className="flex gap-2 text-xs">
                <button onClick={handleAdd} disabled={adding} className="bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50">{adding ? '追加中' : '保存'}</button>
                <button onClick={()=>{setShowAddForm(false); setNewName(''); setNewPhotoUrl('');}} className="px-3 py-1 rounded border">キャンセル</button>
              </div>
            </div>
          )}
        </div>
        {currentClient && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-lg font-bold text-gray-500">
                {currentClient.photoUrl ? <img src={currentClient.photoUrl} alt={currentClient.name} className="w-full h-full object-cover" /> : currentClient.name.slice(0,2)}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{currentClient.name}</p>
                {/* 写真URL更新フォーム削除 */}
              </div>
            </div>
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-gray-600">基本情報（最新アセスメント「本人情報」）</h3>
                {changedKeys.size>0 && <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded">{changedKeys.size}項目更新</span>}
              </div>
              {personalLoading && <p className="text-[11px] text-gray-500">読み込み中...</p>}
              {personalError && <p className="text-[11px] text-red-500">{personalError}</p>}
              {!personalLoading && !personalError && (
                hasAssessment && Object.values(personalInfo).some(v=>v) ? (
                  <table className="w-full text-[11px] border rounded overflow-hidden bg-white">
                    <tbody>
                      {['電話番号','生年月日','同居状況','現住所','住民票','住居形態','性別'].map(label => {
                        const changed = changedKeys.has(label);
                        return (
                          <tr key={label} className={changed ? 'bg-yellow-50' : 'odd:bg-gray-50'}>
                            <th className="text-left px-2 py-1 font-medium w-24 text-gray-600">{label}</th>
                            <td className="px-2 py-1 text-gray-800 flex flex-col gap-0.5">
                              <span className="leading-tight">{personalInfo[label] ? (
                                personalInfo[label]
                              ) : (
                                <span className="text-gray-400 italic">（未入力）</span>
                              )}</span>
                              {changed && prevPersonalInfo && (
                                <span className="text-[10px] text-gray-500 line-clamp-2">旧: {prevPersonalInfo[label] || '—'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-3 border rounded bg-gray-50 text-[11px] flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 text-gray-600">まだアセスメント（本人情報）が登録されていません。AI を用いて初回アセスメントを作成できます。</div>
                    <button onClick={()=> setActiveTab('assessment')} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded shadow hover:bg-indigo-700 whitespace-nowrap">AI で初回アセスメント作成</button>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </section>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4 text-sm">
          <button onClick={()=>setActiveTab('detail')} className={`py-2 px-1 border-b-2 -mb-px ${activeTab==='detail' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>基本情報・支援計画</button>
          <button onClick={()=>setActiveTab('assessment')} className={`py-2 px-1 border-b-2 -mb-px ${activeTab==='assessment' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>アセスメント</button>
        </nav>
      </div>
      <div>
        {activeTab === 'detail' && <ClientDetail selectedClient={currentClient?.name || ''} />}
        {activeTab === 'assessment' && <AssessmentAssistant />}
      </div>
    </div>
  );
}

// 写真更新コンポーネント削除
