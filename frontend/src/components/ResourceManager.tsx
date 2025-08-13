import { useEffect, useState } from 'react';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Resource>({ ...emptyResource });
  const [editingId, setEditingId] = useState<string | null>(null);
  const API_BASE = 'http://localhost:8000';

  const fetchResources = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/resources/`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '取得に失敗しました');
      setResources(data);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResources(); }, []);

  const handleChange = (field: keyof Resource, value: string) => {
    if (field === 'keywords') {
      setForm(prev => ({ ...prev, keywords: value.split(/[,\s]+/).filter(Boolean) }));
    } else {
      setForm(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `${API_BASE}/resources/${editingId}` : `${API_BASE}/resources/`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '保存に失敗しました');
      setForm({ ...emptyResource });
      setEditingId(null);
      fetchResources();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
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
        const data = await res.json();
        throw new Error(data.detail || '削除に失敗しました');
      }
      if (editingId === id) {
        setEditingId(null);
        setForm({ ...emptyResource });
      }
      fetchResources();
    } catch (e:any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">社会資源・制度管理</h2>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <div className="bg-white border rounded p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <input className="border p-2 rounded" placeholder="サービス名 *" value={form.service_name} onChange={e=>handleChange('service_name', e.target.value)} />
          <input className="border p-2 rounded" placeholder="カテゴリ" value={form.category||''} onChange={e=>handleChange('category', e.target.value)} />
          <input className="border p-2 rounded" placeholder="対象" value={form.target_users||''} onChange={e=>handleChange('target_users', e.target.value)} />
          <input className="border p-2 rounded" placeholder="提供主体" value={form.provider||''} onChange={e=>handleChange('provider', e.target.value)} />
          <input className="border p-2 rounded" placeholder="所在地" value={form.location||''} onChange={e=>handleChange('location', e.target.value)} />
          <input className="border p-2 rounded" placeholder="費用" value={form.cost||''} onChange={e=>handleChange('cost', e.target.value)} />
          <input className="border p-2 rounded" placeholder="電話" value={form.contact_phone||''} onChange={e=>handleChange('contact_phone', e.target.value)} />
          <input className="border p-2 rounded" placeholder="URL" value={form.contact_url||''} onChange={e=>handleChange('contact_url', e.target.value)} />
          <input className="border p-2 rounded col-span-2" placeholder="キーワード (空白/カンマ区切り)" value={(form.keywords||[]).join(' ')} onChange={e=>handleChange('keywords', e.target.value)} />
          <textarea className="border p-2 rounded col-span-2" placeholder="概要 / 説明" rows={3} value={form.description||''} onChange={e=>handleChange('description', e.target.value)} />
          <textarea className="border p-2 rounded col-span-2" placeholder="利用条件" rows={2} value={form.eligibility||''} onChange={e=>handleChange('eligibility', e.target.value)} />
          <textarea className="border p-2 rounded col-span-2" placeholder="申請手続き" rows={2} value={form.application_process||''} onChange={e=>handleChange('application_process', e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={!form.service_name || loading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-blue-300">
            {editingId ? '更新' : '追加'}
          </button>
          <button onClick={()=>{ setForm({ ...emptyResource }); setEditingId(null); }} className="border px-4 py-2 rounded">リセット</button>
        </div>
      </div>
      <div>
        <h3 className="font-semibold mb-2">登録済み ({resources.length})</h3>
        {loading ? <div>読込中...</div> : (
          <div className="grid md:grid-cols-2 gap-4">
            {resources.map(r => (
              <div key={r.id} className="border rounded p-3 bg-white shadow-sm space-y-1">
                <div className="font-bold text-sm">{r.service_name}</div>
                <div className="text-xs text-gray-600">{r.category}</div>
                <div className="text-xs line-clamp-3 whitespace-pre-wrap">{r.description}</div>
                <div className="text-xs text-gray-500">{(r.keywords||[]).join(', ')}</div>
                <div className="flex gap-2 pt-1">
                  <button onClick={()=>handleEdit(r)} className="text-blue-600 text-xs">編集</button>
                  <button onClick={()=>handleDelete(r.id)} className="text-red-600 text-xs">削除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
