"use client";
import { useEffect, useState, useCallback } from 'react';
import ResourceDetailCard from './resource/ResourceDetailCard';
import type { ResourceRecord } from './resource/types';

interface Resource {
  id?: string;
  service_name: string;
  category?: string;
  target_users?: string;
  description?: string;
  eligibility?: string;
  application_process?: string;
  cost?: string;
  provider?: string;
  location?: string;
  contact_phone?: string;
  contact_fax?: string;
  contact_email?: string;
  contact_url?: string;
  keywords?: string[];
  last_verified_at?: number;
}

interface ResourceMemo {
  id?: string;
  resource_id: string;
  content: string;
  created_at?: number;
  updated_at?: number;
}

interface ImportResult {
  source_path: string;
  total_input: number;
  created: number;
  updated: number;
  skipped: number;
  errors?: string[];
  overwrite: boolean;
  dry_run: boolean;
  missing_field_counts: Record<string, number>;
  skipped_invalid_service_name: number;
}

const emptyResource: Resource = {
  service_name: '',
  category: '',
  target_users: '',
  description: '',
  eligibility: '',
  application_process: '',
  cost: '',
  provider: '',
  location: '',
  contact_phone: '',
  contact_fax: '',
  contact_email: '',
  contact_url: '',
  keywords: []
};

export default function ResourceManager() {
  const [resources, setResources] = useState<Resource[]>([]);
  // 資源一覧取得用のローディング
  const [resourcesLoading, setResourcesLoading] = useState<boolean>(false);
  // 追加/更新/インポートなどアクション用ローディング
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Resource>({ ...emptyResource });
  const [editingId, setEditingId] = useState<string | null>(null);
  // AbortError 判定用 type guard
  const isAbortError = (err: unknown): boolean =>
    typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError';
  const [memos, setMemos] = useState<Record<string, ResourceMemo[]>>({});
  const [memoLoading, setMemoLoading] = useState<Record<string, boolean>>({});
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [searchMode, setSearchMode] = useState<boolean>(false);
  const [showEditor, setShowEditor] = useState<boolean>(false); // 追加/編集フォーム折りたたみ
  const [detailResource, setDetailResource] = useState<Resource | null>(null);
  const [newDetailMemoContent, setNewDetailMemoContent] = useState<string>('');
  const API_BASE = 'http://localhost:8000';

  const fetchResources = useCallback(async () => {
    setResourcesLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      const res = await fetch(`${API_BASE}/resources/`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data: unknown = await res.json();
      if (!res.ok) {
        const detail = (data as { detail?: string })?.detail;
        throw new Error(detail || '取得に失敗しました');
      }
      setResources(data as Resource[]);
    } catch (e: unknown) {
  if (isAbortError(e)) {
        setError('タイムアウト: バックエンドが起動していない可能性があります (uvicorn を起動してください)。');
      } else if (e instanceof Error) {
        setError(e.message || '取得エラー');
      } else {
        setError('取得エラー');
      }
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchMode(false);
      fetchResources();
      return;
    }
    setSearching(true);
    setSearchMode(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_BASE}/resources/search?q=${encodeURIComponent(searchQuery.trim())}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data: unknown = await res.json();
      if (!res.ok) {
        const detail = (data as { detail?: string })?.detail;
        throw new Error(detail || '検索に失敗しました');
      }
      setResources(data as Resource[]);
    } catch(e: unknown) {
  if (isAbortError(e)) {
        setError('タイムアウト: バックエンドが起動していない可能性があります。');
      } else if (e instanceof Error) {
        setError(e.message || '検索エラー');
      } else {
        setError('検索エラー');
      }
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => { fetchResources(); }, [fetchResources]);

  const handleChange = (field: keyof Resource, value: string) => {
    if (field === 'keywords') {
      setForm(prev => ({ ...prev, keywords: value.split(/[,\s]+/).filter(Boolean) }));
    } else {
      setForm(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `${API_BASE}/resources/${editingId}` : `${API_BASE}/resources/`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const detail = (data as { detail?: string })?.detail;
        throw new Error(detail || '保存に失敗しました');
      }
      setForm({ ...emptyResource });
      setEditingId(null);
      fetchResources();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };
  const handleImportLocal = async (overwrite: boolean) => {
    if (!confirm(`local_resources.json を読み込み${overwrite ? ' (上書きあり)' : ''} しますか？`)) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resources/import-local?overwrite=${overwrite}` , { method: 'POST' });
      const data: unknown = await res.json();
      if (!res.ok) {
        const detail = (data as { detail?: string })?.detail;
        throw new Error(detail || 'インポート失敗');
      }
	setImportResult(data as ImportResult);
      fetchResources();
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : 'インポート失敗');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = (r: Resource) => {
    setForm({ ...r });
    setEditingId(r.id || null);
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (!confirm('削除しますか？')) return;
    try {
      const res = await fetch(`${API_BASE}/resources/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data: unknown = await res.json();
        const detail = (data as { detail?: string })?.detail;
        throw new Error(detail || '削除に失敗しました');
      }
      if (editingId === id) {
        setEditingId(null);
        setForm({ ...emptyResource });
      }
      fetchResources();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    }
  };

  const fetchMemos = async (resourceId: string) => {
    setMemoLoading(prev=>({...prev, [resourceId]: true}));
    try {
      const res = await fetch(`${API_BASE}/resources/${resourceId}/memos`);
      const data: unknown = await res.json();
      if (!res.ok) {
        const detail = (data as { detail?: string })?.detail;
        throw new Error(detail || 'メモ取得失敗');
      }
      setMemos(prev=>({...prev, [resourceId]: data as ResourceMemo[]}));
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : 'メモ取得失敗');
    } finally {
      setMemoLoading(prev=>({...prev, [resourceId]: false}));
    }
  };

  // 詳細モーダルが開いた時にメモ未取得なら取得
  useEffect(()=>{
    if (detailResource?.id && !memos[detailResource.id]) {
      fetchMemos(detailResource.id);
    }
  }, [detailResource, memos]);

  const addMemoInDetail = async () => {
    if (!detailResource?.id) return;
    const content = newDetailMemoContent.trim();
    if (!content) return;
    try {
      const res = await fetch(`${API_BASE}/resources/${detailResource.id}/memos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id: detailResource.id, content })
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const detail = (data as { detail?: string })?.detail;
        throw new Error(detail || 'メモ追加失敗');
      }
      setNewDetailMemoContent('');
      fetchMemos(detailResource.id);
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : 'メモ追加失敗');
    }
  };

  const updateMemo = async (memo: ResourceMemo) => {
    const newContent = prompt('メモを編集', memo.content);
    if (newContent == null) return;
    try {
      const res = await fetch(`${API_BASE}/resources/memos/${memo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const detail = (data as { detail?: string })?.detail;
        throw new Error(detail || 'メモ更新失敗');
      }
      fetchMemos(memo.resource_id);
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : 'メモ更新失敗');
    }
  };

  const deleteMemo = async (memo: ResourceMemo) => {
    if (!confirm('メモを削除しますか？')) return;
    try {
      const res = await fetch(`${API_BASE}/resources/memos/${memo.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data: unknown = await res.json();
        const detail = (data as { detail?: string })?.detail;
        throw new Error(detail || 'メモ削除失敗');
      }
      fetchMemos(memo.resource_id);
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : 'メモ削除失敗');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight section-title">社会資源・制度管理</h2>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {/* 検索バー (常時表示) */}
      <div className="surface card-shadow border border-gray-100 p-3 sm:p-4 flex flex-wrap gap-2 items-center">
        <input
          className="ginput flex-1 min-w-[240px]"
          placeholder="検索キーワード (資源＋メモ全文 / スペースAND)"
          value={searchQuery}
          onChange={e=>setSearchQuery(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') handleSearch(); }}
        />
        <button onClick={handleSearch} disabled={searching} className="gbtn primary disabled:opacity-60 text-sm">検索</button>
        {searchMode && (
          <button onClick={()=>{ setSearchQuery(''); setSearchMode(false); fetchResources(); }} className="gbtn text h-9">クリア</button>
        )}
        <button
          onClick={()=>setShowEditor(s=>!s)}
          className="ml-auto gbtn tonal text-xs"
        >{showEditor ? 'フォームを閉じる' : '追加/編集フォームを開く'}</button>
      </div>
      {showEditor && (
      <div className="surface card-shadow border border-gray-100 rounded-lg p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input className="ginput" placeholder="サービス名 *" value={form.service_name} onChange={e=>handleChange('service_name', e.target.value)} />
          <input className="ginput" placeholder="カテゴリ" value={form.category||''} onChange={e=>handleChange('category', e.target.value)} />
          <input className="ginput" placeholder="対象" value={form.target_users||''} onChange={e=>handleChange('target_users', e.target.value)} />
          <input className="ginput" placeholder="提供主体" value={form.provider||''} onChange={e=>handleChange('provider', e.target.value)} />
          <input className="ginput" placeholder="所在地" value={form.location||''} onChange={e=>handleChange('location', e.target.value)} />
          <input className="ginput" placeholder="費用" value={form.cost||''} onChange={e=>handleChange('cost', e.target.value)} />
          <input className="ginput" placeholder="電話" value={form.contact_phone||''} onChange={e=>handleChange('contact_phone', e.target.value)} />
          <input className="ginput" placeholder="URL" value={form.contact_url||''} onChange={e=>handleChange('contact_url', e.target.value)} />
          <input className="ginput sm:col-span-2" placeholder="キーワード (空白/カンマ区切り)" value={(form.keywords||[]).join(' ')} onChange={e=>handleChange('keywords', e.target.value)} />
          <textarea className="rounded-lg border border-gray-200 p-3 sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="概要 / 説明" rows={3} value={form.description||''} onChange={e=>handleChange('description', e.target.value)} />
          <textarea className="rounded-lg border border-gray-200 p-3 sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="利用条件" rows={2} value={form.eligibility||''} onChange={e=>handleChange('eligibility', e.target.value)} />
          <textarea className="rounded-lg border border-gray-200 p-3 sm:col-span-2 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="申請手続き" rows={2} value={form.application_process||''} onChange={e=>handleChange('application_process', e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={handleSubmit} disabled={!form.service_name.trim() || actionLoading} className="gbtn primary disabled:opacity-60">
            {editingId ? '更新' : '追加'}
          </button>
          <button onClick={()=>{ setForm({ ...emptyResource }); setEditingId(null); }} className="gbtn" disabled={actionLoading}>リセット</button>
          <button onClick={()=>handleImportLocal(false)} disabled={actionLoading} className="gbtn tonal disabled:opacity-60">Import</button>
          <button onClick={()=>handleImportLocal(true)} disabled={actionLoading} className="gbtn disabled:opacity-60 bg-red-600 text-white border-transparent hover:bg-red-700">Import上書き</button>
          { (actionLoading || resourcesLoading) && <span className="text-xs text-gray-500 self-center">処理中...</span> }
        </div>
        {importResult && (
          <div className="text-xs bg-gray-50 border rounded p-2 space-y-1">
            <div className="font-semibold">Import結果</div>
            <div>source: {importResult.source_path}</div>
            <div>total: {importResult.total_input} / created: {importResult.created} / updated: {importResult.updated} / skipped: {importResult.skipped}</div>
            {importResult.errors && importResult.errors.length > 0 && (
              <details>
                <summary className="cursor-pointer">errors ({importResult.errors.length})</summary>
                <ul className="list-disc ml-4">
                  {importResult.errors.slice(0,5).map((er:string,i:number)=>(<li key={i}>{er}</li>))}
                  {importResult.errors.length > 5 && <li>...他 {importResult.errors.length-5} 件</li>}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
      )}
      <div>
        <h3 className="font-semibold mb-2 section-title">登録済み ({resources.length})</h3>
  {resourcesLoading ? (
    <div className="grid md:grid-cols-2 gap-4">
      {[...Array(4)].map((_,i)=>(
        <div key={i} className="surface card-shadow border border-gray-100 rounded-lg p-3 space-y-2 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/3 mb-1" />
          <div className="h-3 bg-gray-100 rounded w-1/2 mb-1" />
          <div className="h-3 bg-gray-100 rounded w-full mb-1" />
          <div className="h-3 bg-gray-100 rounded w-3/4 mb-1" />
          <div className="flex gap-2 pt-1">
            <div className="h-7 w-12 bg-gray-200 rounded" />
            <div className="h-7 w-12 bg-gray-200 rounded" />
            <div className="h-7 w-12 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="grid md:grid-cols-2 gap-4">
      {resources.map(r => {
        const typeBadge = /制度/.test(`${r.category||''} ${r.service_name||''}`) ? '制度' : 'サービス';
        return (
          <div
            key={r.id}
            className="surface card-shadow border border-gray-100 rounded-lg p-3 space-y-1 cursor-pointer hover-scale"
            onClick={()=> setDetailResource(r)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-bold text-sm leading-snug break-words flex-1">{r.service_name}</div>
              <span className={`chip ${typeBadge==='制度' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>{typeBadge}</span>
            </div>
            <div className="text-[11px] text-gray-600 line-clamp-1">{r.category}</div>
            <div className="text-xs line-clamp-3 whitespace-pre-wrap min-h-[2.5rem]">{r.description}</div>
            <div className="text-[10px] text-gray-500 truncate">{(r.keywords||[]).join(', ')}</div>
            {r.last_verified_at && <div className="text-[10px] text-gray-400">確認:{new Date(r.last_verified_at*1000).toLocaleDateString()}</div>}
            <div className="flex gap-2 pt-1" onClick={e=>e.stopPropagation()}>
              <button onClick={()=>handleEdit(r)} className="text-xs text-blue-600 hover:underline">編集</button>
              <button onClick={()=>handleDelete(r.id)} className="text-xs text-red-600 hover:underline">削除</button>
              <button onClick={()=>{ setDetailResource(r); }} className="text-xs text-emerald-600 hover:underline">メモ</button>
            </div>
          </div>
        );
      })}
    </div>
  )}
      </div>
      {detailResource && (
        <div className="fixed inset-0 z-[1000] flex items-start sm:items-center justify-center bg-black/40 p-4" onClick={()=>setDetailResource(null)}>
          <div onClick={e=>e.stopPropagation()} className="relative">
            {memoLoading[detailResource.id!] ? (
              <div className="surface card-shadow rounded-xl border border-gray-100 p-5 max-w-lg w-full animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
                <div className="space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
                <div className="mt-4 pt-3">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2" />
                  <div className="h-20 bg-gray-100 rounded mb-2" />
                  <div className="h-8 bg-gray-100 rounded mb-2" />
                  <div className="h-8 bg-gray-100 rounded mb-2" />
                </div>
                <div className="mt-4 pt-3 flex justify-end gap-2">
                  <div className="h-8 w-20 bg-gray-200 rounded" />
                  <div className="h-8 w-20 bg-gray-200 rounded" />
                </div>
              </div>
            ) : (
              <ResourceDetailCard
                resource={detailResource as unknown as ResourceRecord}
                loading={memoLoading[detailResource.id!]}
                error={error}
                onClose={()=>setDetailResource(null)}
                footer={
                  <>
                    <button className="gbtn text" onClick={()=>setDetailResource(null)}>閉じる</button>
                    <button className="gbtn primary" onClick={()=>{handleEdit(detailResource); setShowEditor(true); setDetailResource(null);}}>編集する</button>
                  </>
                }
              >
              <div className="pt-3">
                <h5 className="font-semibold text-sm mb-2 flex items-center gap-2">メモ
                  {memoLoading[detailResource.id!] && <span className="text-[10px] text-gray-500">読み込み中...</span>}
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
                    {(memos[detailResource.id!]||[]).map(m => (
                      <li key={m.id} className="text-xs border border-gray-200 rounded p-2 flex justify-between gap-2 items-start bg-white">
                        <span className="whitespace-pre-wrap flex-1">{m.content}</span>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={()=>updateMemo(m)} className="text-blue-500">編</button>
                          <button onClick={()=>deleteMemo(m)} className="text-red-500">✕</button>
                        </div>
                      </li>
                    ))}
                    {(memos[detailResource.id!]||[]).length === 0 && !memoLoading[detailResource.id!] && (
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
