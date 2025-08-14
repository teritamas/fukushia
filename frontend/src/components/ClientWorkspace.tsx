"use client";
import React, { useEffect, useState } from 'react';
import ClientDetail from './ClientDetail';
import AssessmentAssistant from './AssessmentAssistant';
import { db } from '../firebase';
import { collection, getDocs, query, where, QueryDocumentSnapshot, DocumentData, orderBy } from 'firebase/firestore';
import { useClientContext } from './ClientContext';

// ClientWorkspace will become the central hub for managing a client.
// For now, it will just have tabs to switch between client details and assessment.
// Row background helper: changed fields are highlighted; otherwise zebra per row
const getRowBackgroundColor = (changed: boolean, rowIndex: number): string => {
  if (changed) return 'bg-yellow-50';
  return rowIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white';
};

export default function ClientWorkspace() {
  const [activeTab, setActiveTab] = useState<'detail' | 'assessment'>('detail');
  const { currentClient, setCurrentClient, requestAssessmentEdit, homeNavSignal } = useClientContext();
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
      try {
    const ref = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/clients`);
    const q = query(ref, orderBy('createdAt','asc'));
    const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, name: d.data().name, photoUrl: d.data().photoUrl, basicInfo: d.data().basicInfo }));
        if (!currentClient && list.length > 0) setCurrentClient(list[0]);
      } finally {
        // no-op
      }
    };
    fetchClients();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When the global header signals "go home", ensure we show the basic info tab
  useEffect(()=>{
    setActiveTab('detail');
  }, [homeNavSignal]);

  // 最新アセスメントから本人情報抽出
  useEffect(()=>{
    const loadPersonal = async () => {
      if (!currentClient) { setPersonalInfo({}); setPrevPersonalInfo(null); setChangedKeys(new Set()); setHasAssessment(false); return; }
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
            const formObj = assessData[formKey] as Record<string, unknown> | undefined;
            if (formObj && typeof formObj === 'object' && '本人情報' in formObj) {
              return (formObj['本人情報'] as Record<string, unknown>) || null;
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
          latestInfo[f] = latestSection ? extract((latestSection as Record<string, unknown>)[f]) : '';
          prevInfo[f] = prevSection ? extract((prevSection as Record<string, unknown>)[f]) : '';
        }
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
      <section className="bg-white rounded-lg p-4 shadow-sm">
        {currentClient && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-lg font-bold text-gray-500">
                {currentClient.photoUrl ? <img src={currentClient.photoUrl} alt={currentClient.name} className="w-full h-full object-cover" /> : currentClient.name.slice(0,2)}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{currentClient.name}</p>
              </div>
            </div>
            <div className="md:col-span-3 space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-gray-600 flex items-center gap-2">基本情報（最新アセスメント「本人情報」）
                  {hasAssessment && (
                    <button
                      onClick={()=>{ requestAssessmentEdit({ category: '本人情報' }); setActiveTab('assessment'); }}
                      className="ml-2 px-2 py-0.5 text-[10px] rounded border bg-white hover:bg-gray-50 text-gray-600"
                    >編集</button>
                  )}
                </h3>
                {changedKeys.size>0 && <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded">{changedKeys.size}項目更新</span>}
              </div>
              {personalLoading && <p className="text-[11px] text-gray-500">読み込み中...</p>}
              {personalError && <p className="text-[11px] text-red-500">{personalError}</p>}
              {!personalLoading && !personalError && (
                hasAssessment && Object.values(personalInfo).some(v=>v) ? (
                  <div className="w-full text-[11px] overflow-hidden bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-2">
                      {['電話番号','生年月日','同居状況','現住所','住民票','住居形態','性別'].map((label, idx) => {
                        const changed = changedKeys.has(label);
                        // 交互の薄グレー背景を行単位（2カラムで1行扱い）で適用
                        const rowIndex = Math.floor(idx / 2);
                        const rowBg = getRowBackgroundColor(changed, rowIndex);
                        return (
                          <div key={label} className={rowBg}>
                            <div className="flex">
                              <div className="text-left px-2 py-1 font-medium w-24 text-gray-600">{label}</div>
                              <div className="px-2 py-1 text-gray-800 flex-1 flex flex-col gap-0.5">
                                <span className="leading-tight">{personalInfo[label] ? (
                                  personalInfo[label]
                                ) : (
                                  <span className="text-gray-400 italic">（未入力）</span>
                                )}</span>
                                {changed && prevPersonalInfo && (
                                  <span className="text-[10px] text-gray-500 line-clamp-2">旧: {prevPersonalInfo[label] || '—'}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
