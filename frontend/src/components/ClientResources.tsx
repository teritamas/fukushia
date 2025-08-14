import { useEffect, useMemo, useState } from 'react';
import { fetchAdvancedSuggestions, AdvancedSuggestedResource } from '../lib/advancedSuggestions';
import { db } from '../firebase';
import ResourceSuggestionCard from './resource/ResourceSuggestionCard';
import ResourceDetailCard from './resource/ResourceDetailCard';
import { collection, addDoc, deleteDoc, doc, getDocs, query, where, updateDoc, serverTimestamp, DocumentData } from 'firebase/firestore';

interface ResourceUsageDoc {
  id: string;
  clientName: string;
  resourceId: string;
  serviceName: string;
  addedAt?: { seconds?: number };
  addedBy?: string;
  status?: 'active' | 'ended';
  notes?: string;
}

interface ResourceRecord {
  id?: string;
  service_name: string;
  category?: string;
  description?: string;
  keywords?: string[];
  provider?: string;
  eligibility?: string;
  application_process?: string;
  last_verified_at?: number;
  target_users?: string;
  location?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_url?: string;
}

// Minimal nested assessment data structure actually referenced for token extraction
type AssessmentLeaf = string | Record<string, string>;
type AssessmentCategory = Record<string, AssessmentLeaf>;
export interface AssessmentDataShape {
  assessment?: Record<string, AssessmentCategory>;
}

interface ClientResourcesProps {
  clientName: string | null;
  assessmentData: AssessmentDataShape | null; // simplified assessment for suggestions
  hasAssessmentPlan: boolean; // original existence flag (even if simplification produced null)
}

interface SuggestionEntry {
  resource: ResourceRecord;
  score: number;
  matched: string[]; // matched keywords
}

const API_BASE = 'http://localhost:8000';

export default function ClientResources({ clientName, assessmentData, hasAssessmentPlan }: ClientResourcesProps) {
  const [usages, setUsages] = useState<ResourceUsageDoc[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingIds, setAddingIds] = useState<Record<string, boolean>>({});
  const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({});
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({});
  // Resource detail modal state
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<ResourceRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Memo states for detail modal
  interface ResourceMemo { id?: string; resource_id: string; content: string; created_at?: number; updated_at?: number; }
  const [memos, setMemos] = useState<Record<string, ResourceMemo[]>>({});
  const [memoLoading, setMemoLoading] = useState<Record<string, boolean>>({});
  const [newDetailMemoContent, setNewDetailMemoContent] = useState('');

  const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'default-app-id';
  const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || 'test-user';

  // Load current usages for client
  useEffect(()=>{
    if (!clientName) { setUsages([]); return; }
    const fetch = async () => {
      setLoadingUsage(true); setError(null);
      try {
        const ref = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/client_resources`);
        const q = query(ref, where('clientName','==', clientName));
        const snap = await getDocs(q);
        const list: ResourceUsageDoc[] = snap.docs.map(d=> {
          const data = d.data() as DocumentData;
          return {
            id: d.id,
            clientName: data.clientName as string,
            resourceId: data.resourceId as string,
            serviceName: data.serviceName as string,
            addedAt: data.addedAt,
            addedBy: data.addedBy,
            status: data.status,
            notes: data.notes,
          };
        });
        // sort active first then addedAt desc
        list.sort((a,b)=>{
          const sa = a.status === 'active' ? 0 : 1;
          const sb = b.status === 'active' ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return (b.addedAt?.seconds||0) - (a.addedAt?.seconds||0);
        });
        setUsages(list);
      } catch(e: unknown) { setError(e instanceof Error ? e.message : '利用中資源の取得に失敗'); }
      finally { setLoadingUsage(false);} };
    fetch();
  }, [clientName, APP_ID, USER_ID]);

  // Load all resources (could optimize later with server-side suggestion endpoint)
  useEffect(()=>{
    const fetchRes = async ()=> {
      setLoadingResources(true); setError(null);
      try {
        const res = await fetch(`${API_BASE}/resources/`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || '社会資源一覧取得失敗');
        setResources(data as ResourceRecord[]);
      } catch(e: unknown) { setError(e instanceof Error ? e.message : '社会資源一覧取得失敗'); }
      finally { setLoadingResources(false); }
    };
    fetchRes();
  }, []);

  const existingIds = useMemo(()=> new Set(usages.map(u=>u.resourceId)), [usages]);

  // Extract tokens from assessment for naive suggestion
  const assessmentTokens = useMemo(()=>{
    if (!assessmentData) return new Set<string>();
    const texts: string[] = [];
    try {
      // Flatten assessmentData (form -> category -> value|subObject)
      Object.values(assessmentData.assessment || {}).forEach((categories)=>{
        Object.values(categories || {}).forEach((val)=>{
          if (typeof val === 'string') texts.push(val);
          else if (val && typeof val === 'object' && !Array.isArray(val)) {
            Object.values(val).forEach((sub)=>{ if (typeof sub === 'string') texts.push(sub); });
          }
        });
      });
    } catch { /* ignore */ }
    const joined = texts.join(' ');
    const raw = joined.split(/[\s、。,.；;:\n\r\t/()「」『』【】\[\]{}]+/);
    const toks = raw.map(t=>t.trim().toLowerCase()).filter(t=> t.length>1 && t.length <= 20);
    return new Set(toks);
  }, [assessmentData]);

  const suggestions: SuggestionEntry[] = useMemo(()=>{
    if (!assessmentData || resources.length === 0) return [];
    const result: SuggestionEntry[] = [];
    resources.forEach(r=>{
      if (!r.id) return;
      if (existingIds.has(r.id)) return; // skip already used
      const rKeywords = (r.keywords || []).map(k=>k.toLowerCase());
      const matched = rKeywords.filter(k=> assessmentTokens.has(k));
      // also try simple includes from service_name/category
      const serviceTokens = (r.service_name + ' ' + (r.category||'')).split(/[\s/]+/).map(s=>s.toLowerCase());
      serviceTokens.forEach(st=>{ if (assessmentTokens.has(st) && !matched.includes(st)) matched.push(st); });
      if (matched.length === 0) return;
      const score = matched.length * 3 + (r.last_verified_at ? 1 : 0);
      result.push({ resource: r, score, matched });
    });
    // sort by score desc then verified desc
    result.sort((a,b)=>{ if (b.score !== a.score) return b.score - a.score; return (b.resource.last_verified_at||0)-(a.resource.last_verified_at||0); });
    return result.slice(0, 8);
  }, [assessmentData, resources, existingIds, assessmentTokens]);

  // Advanced suggestions (LLM + embeddings) – fallback to naive if fails
  const [adv, setAdv] = useState<AdvancedSuggestedResource[] | null>(null);
  const [advLoading, setAdvLoading] = useState(false);
  const [advFailed, setAdvFailed] = useState(false);
  const [advReloadKey, setAdvReloadKey] = useState(0);
  useEffect(()=>{
    let cancelled = false;
    if (!assessmentData || !clientName) { setAdv(null); return; }
    setAdvLoading(true);
    setAdvFailed(false);
    fetchAdvancedSuggestions(assessmentData).then(r=>{
      if (cancelled) return;
      if (r && r.resources) {
        setAdv(r.resources);
      } else {
        // null -> fetch error or non-OK
        setAdvFailed(true);
        setAdv([]); // keep array for easier conditional rendering
      }
    }).finally(()=>{ if (!cancelled) setAdvLoading(false); });
    return ()=>{ cancelled = true; };
  }, [assessmentData, clientName, advReloadKey]);

  const retryAdvanced = () => setAdvReloadKey(k=>k+1);

  const addUsage = async (res: ResourceRecord) => {
    if (!clientName || !res.id) return;
    setAddingIds(prev=>({...prev, [res.id!]: true}));
    try {
      const ref = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/client_resources`);
      await addDoc(ref, { clientName, resourceId: res.id, serviceName: res.service_name, status: 'active', addedAt: serverTimestamp(), addedBy: USER_ID });
      // refresh usages list
      const qRef = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/client_resources`);
      const qSnap = await getDocs(query(qRef, where('clientName','==', clientName)));
      const list: ResourceUsageDoc[] = qSnap.docs.map(d=> {
        const data = d.data() as DocumentData;
        return {
          id: d.id,
            clientName: data.clientName as string,
            resourceId: data.resourceId as string,
            serviceName: data.serviceName as string,
            addedAt: data.addedAt,
            addedBy: data.addedBy,
            status: data.status,
            notes: data.notes,
        };
      });
      list.sort((a,b)=>{ const sa = a.status==='active'?0:1; const sb = b.status==='active'?0:1; if (sa!==sb) return sa-sb; return (b.addedAt?.seconds||0)-(a.addedAt?.seconds||0); });
      setUsages(list);
    } catch(e: unknown) { setError(e instanceof Error ? e.message : '追加失敗'); }
    finally { setAddingIds(prev=>({...prev, [res.id!]: false})); }
  };

  const openDetail = async (resourceId: string) => {
    setDetailId(resourceId);
    setDetailError(null);
    // Try from already loaded list first
    const cached = resources.find(r => r.id === resourceId);
    if (cached && (cached.description || cached.category)) {
      setDetailData(cached);
    } else {
      setDetailData(null);
    }
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/resources/${resourceId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || '詳細取得に失敗しました');
      setDetailData(data as ResourceRecord);
    } catch (e: unknown) {
      setDetailError(e instanceof Error ? e.message : '詳細取得に失敗しました');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => { setDetailId(null); setDetailData(null); setDetailLoading(false); setDetailError(null); };

  // Fetch memos for a resource
  const fetchMemos = async (resourceId: string) => {
    setMemoLoading(prev=>({...prev, [resourceId]: true}));
    try {
      const res = await fetch(`${API_BASE}/resources/${resourceId}/memos`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'メモ取得失敗');
      setMemos(prev=>({...prev, [resourceId]: data as ResourceMemo[]}));
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : 'メモ取得失敗');
    } finally { setMemoLoading(prev=>({...prev, [resourceId]: false})); }
  };

  // When opening detail, load memos if not loaded
  useEffect(()=>{
    if (detailId && !memos[detailId]) fetchMemos(detailId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  const addMemoInDetail = async () => {
    if (!detailId) return;
    const content = newDetailMemoContent.trim();
    if (!content) return;
    try {
      const res = await fetch(`${API_BASE}/resources/${detailId}/memos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource_id: detailId, content })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'メモ追加失敗');
      setNewDetailMemoContent('');
      fetchMemos(detailId);
    } catch(e: unknown) { setError(e instanceof Error ? e.message : 'メモ追加失敗'); }
  };

  const updateMemo = async (memo: ResourceMemo) => {
    const newContent = prompt('メモを編集', memo.content);
    if (newContent == null) return;
    try {
      const res = await fetch(`${API_BASE}/resources/memos/${memo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newContent })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'メモ更新失敗');
      fetchMemos(memo.resource_id);
    } catch(e: unknown) { setError(e instanceof Error ? e.message : 'メモ更新失敗'); }
  };

  const deleteMemo = async (memo: ResourceMemo) => {
    if (!confirm('メモを削除しますか？')) return;
    try {
      const res = await fetch(`${API_BASE}/resources/memos/${memo.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || 'メモ削除失敗');
      }
      fetchMemos(memo.resource_id);
    } catch(e: unknown) { setError(e instanceof Error ? e.message : 'メモ削除失敗'); }
  };

  const toggleStatus = async (u: ResourceUsageDoc) => {
    setTogglingIds(prev=>({...prev, [u.id]: true}));
    try {
      const ref = doc(db, `artifacts/${APP_ID}/users/${USER_ID}/client_resources/${u.id}`);
      const newStatus = u.status === 'active' ? 'ended' : 'active';
      await updateDoc(ref, { status: newStatus });
      setUsages(prev=> prev.map(p=> p.id === u.id ? { ...p, status: newStatus } : p));
    } catch(e: unknown) { setError(e instanceof Error ? e.message : '状態更新失敗'); }
    finally { setTogglingIds(prev=>({...prev, [u.id]: false})); }
  };

  const removeUsage = async (u: ResourceUsageDoc) => {
    if (!confirm('利用中リストから削除しますか？')) return;
    setRemovingIds(prev=>({...prev, [u.id]: true}));
    try {
      await deleteDoc(doc(db, `artifacts/${APP_ID}/users/${USER_ID}/client_resources/${u.id}`));
      setUsages(prev=> prev.filter(p=> p.id !== u.id));
    } catch(e: unknown) { setError(e instanceof Error ? e.message : '削除失敗'); }
    finally { setRemovingIds(prev=>({...prev, [u.id]: false})); }
  };

  return (
    <div className="surface card-shadow border border-gray-100 rounded-xl p-4 sm:p-5 space-y-5">
      <h3 className="font-bold section-title mb-2">社会資源・制度の提案と利用状況</h3>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {!clientName && <p className="text-xs text-gray-500">支援対象者を選択してください。</p>}
      {clientName && (
        <>
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">利用中の社会資源・制度 {loadingUsage && <span className="text-[10px] text-gray-400">読込中...</span>}</h4>
            {loadingUsage ? (
              <div className="space-y-2">
                {[...Array(3)].map((_,i)=>(
                  <div key={i} className="surface card-shadow border border-gray-100 rounded-lg p-3 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/2 mb-1" />
                    <div className="h-3 bg-gray-100 rounded w-3/4 mb-1" />
                  </div>
                ))}
              </div>
            ) : usages.length === 0 && <p className="text-xs text-gray-500">まだ登録されていません。</p>}
            <ul className="flex flex-col gap-2">
              {usages.map(u=> (
                <li key={u.id} className="surface border border-gray-100 rounded-lg p-2 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                  <div className="flex-1 flex items-center gap-2">
                    <button onClick={()=> openDetail(u.resourceId)} className="font-semibold mr-1 underline decoration-dotted hover:text-[var(--brand-600)] text-left">
                      {u.serviceName}
                    </button>
                    <span className={`chip ${u.status==='active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{u.status==='active' ? '利用中' : '終了'}</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={()=>toggleStatus(u)} disabled={togglingIds[u.id]} className="gbtn text text-[11px] h-8">{u.status==='active' ? '終了' : '再開'}</button>
                    <button onClick={()=>removeUsage(u)} disabled={removingIds[u.id]} className="gbtn text text-[11px] h-8 text-red-600">削除</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {assessmentData ? (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">利用できる社会資源・制度の提案 {loadingResources && <span className="text-[10px] text-gray-400">資源読込中...</span>} {advLoading && <span className="text-[10px] text-indigo-500">AI解析中...</span>}</h4>
              {advFailed && !advLoading && (
                <div className="text-[11px] text-red-600 flex flex-col gap-1">
                  <span>AI提案の取得に失敗しました（ネットワークまたはサーバエラー）。</span>
                  <div className="flex items-center gap-2">
                    <button onClick={retryAdvanced} className="gbtn primary text-[11px] h-8 bg-red-600 hover:bg-red-700">再試行</button>
                    <span className="text-[10px] text-gray-500">フォールバック: キーワード一致のみを表示</span>
                  </div>
                </div>
              )}
              {(loadingResources || advLoading) ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_,i)=>(
                    <div key={i} className="surface card-shadow border border-gray-100 rounded-lg p-3 animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-1/2 mb-1" />
                      <div className="h-3 bg-gray-100 rounded w-3/4 mb-1" />
                    </div>
                  ))}
                </div>
              ) : (!advFailed && adv && adv.length === 0 && suggestions.length === 0) && (
                <p className="text-[11px] text-gray-500">現在のアセスメント内容から提案できる社会資源・制度は見つかりませんでした。記述を具体化するか関連キーワードを追加してください。</p>
              )}
              <ul className="space-y-2">
                {adv && adv.length>0 && adv.map(a => {
                  const already = existingIds.has(a.resource_id);
                  const r = resources.find(r=> r.id === a.resource_id);
                  return (
                    <ResourceSuggestionCard
                      key={a.resource_id}
                      resource={r || { id: a.resource_id, service_name: a.service_name, description: a.excerpt } as ResourceRecord}
                      meta={{ badge: 'AI', matched: a.matched_keywords, score: a.score, alreadyUsed: already }}
                      onOpenDetail={openDetail}
                      onAdd={r ? addUsage : undefined}
                      addDisabled={addingIds[a.resource_id] || already}
                    />
                  );
                })}
                {(!adv || adv.length===0) && suggestions.map(s => (
                  <ResourceSuggestionCard
                    key={s.resource.id}
                    resource={s.resource}
                    meta={{ matched: s.matched }}
                    onOpenDetail={(id)=> openDetail(id)}
                    onAdd={(res)=> addUsage(res)}
                    addDisabled={addingIds[s.resource.id!]}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">利用できる社会資源・制度の提案</h4>
              {hasAssessmentPlan ? (
                <p className="text-[11px] text-gray-500">アセスメントはありますがテキスト化できる内容がほとんど無いため提案を生成できません。各カテゴリに要約や所感を入力後、対象者を再選択してください。</p>
              ) : (
                <p className="text-[11px] text-gray-500">最新アセスメントが保存されていないため提案は表示されません。まずアセスメントを作成してください。</p>
              )}
            </div>
          )}
        </>
      )}
      {detailId && (
        <div className="fixed inset-0 z-[1000] flex items-start sm:items-center justify-center bg-black/40 p-4" onClick={closeDetail}>
          <div onClick={(e)=> e.stopPropagation()} className="relative">
            {detailLoading ? (
              <div className="surface card-shadow rounded-xl border border-gray-100 p-5 max-w-lg w-full animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
                <div className="space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
                <div className="mt-4 border-t pt-3">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2" />
                  <div className="h-20 bg-gray-100 rounded mb-2" />
                  <div className="h-8 bg-gray-100 rounded mb-2" />
                  <div className="h-8 bg-gray-100 rounded mb-2" />
                </div>
              </div>
            ) : (
              <ResourceDetailCard resource={detailData} loading={detailLoading} error={detailError} onClose={closeDetail}>
                <div className="pt-3">
                  <h5 className="font-semibold text-sm mb-2 flex items-center gap-2">メモ
                    {detailId && memoLoading[detailId] && <span className="text-[10px] text-gray-500">読み込み中...</span>}
                  </h5>
                  <div className="flex gap-2 mb-2">
                    <textarea
                      className="rounded-lg border border-gray-200 p-2 text-xs flex-1 h-20 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="メモを入力..."
                      value={newDetailMemoContent}
                      onChange={e=>setNewDetailMemoContent(e.target.value)}
                    />
                    <button
                      onClick={addMemoInDetail}
                      disabled={!newDetailMemoContent.trim()}
                      className="gbtn primary text-xs h-9"
                    >追加</button>
                  </div>
                  <div className="max-h-48 overflow-auto pr-1">
                    <ul className="space-y-1">
                      {(detailId && memos[detailId] ? memos[detailId] : []).map(m => (
                        <li key={m.id} className="text-xs border border-gray-200 rounded p-2 flex justify-between gap-2 items-start bg-white">
                          <span className="whitespace-pre-wrap flex-1">{m.content}</span>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={()=>updateMemo(m)} className="text-blue-500">編</button>
                            <button onClick={()=>deleteMemo(m)} className="text-red-500">✕</button>
                          </div>
                        </li>
                      ))}
                      {detailId && (memos[detailId]?.length ?? 0) === 0 && !memoLoading[detailId] && (
                        <li className="text-[11px] text-gray-400">メモなし</li>
                      )}
                    </ul>
                  </div>
                </div>
              </ResourceDetailCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
