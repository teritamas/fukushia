"use client";
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from "../firebase";
import { collection, getDocs, addDoc, Timestamp } from "firebase/firestore";
import { useClientContext, ClientData } from "./ClientContext";

interface AppHeaderProps {
  active: string;
  onChange: (key: string) => void;
}

const NAV_ITEMS: { key: string; label: string }[] = [
  { key: 'notes', label: 'メモ・TODO' },
  { key: 'resources', label: '社会資源' },
];

export default function AppHeader({ active, onChange }: AppHeaderProps) {
  const { currentClient, setCurrentClient } = useClientContext();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'default-app-id';
  const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || 'test-user';

  useEffect(()=>{
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const ref = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/clients`);
        const snap = await getDocs(ref);
        const list: ClientData[] = snap.docs.map(d => ({ id: d.id, name: d.data().name, photoUrl: d.data().photoUrl, basicInfo: d.data().basicInfo }));
        setClients(list);
        if (!currentClient && list.length > 0) setCurrentClient(list[0]);
      } finally { setLoadingClients(false); }
    };
    fetchClients();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelect = (id: string) => {
    if (id === '__add__') { setShowAdd(true); return; }
    const next = clients.find(c=> c.id === id) || null;
    setCurrentClient(next);
    setMenuOpen(false);
  };

  const handleAddClient = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const ref = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/clients`);
      const docRef = await addDoc(ref, { name: newName.trim(), photoUrl: newPhotoUrl.trim() || null, createdAt: Timestamp.now() });
      const data: ClientData = { id: docRef.id, name: newName.trim(), photoUrl: newPhotoUrl.trim() || undefined };
      setClients(prev => [...prev, data]);
      setCurrentClient(data);
      setShowAdd(false);
      setNewName("");
      setNewPhotoUrl("");
    } finally { setAdding(false); }
  };
  return (
    <header className="w-full bg-white/80 backdrop-blur border-b sticky top-0 z-30 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="text-lg font-semibold tracking-wide">福祉支援ダッシュボード</div>
        <div className="ml-auto flex items-center gap-3">
          <nav className="flex flex-wrap items-center gap-2">
            {/* カスタムドロップダウン（hoverで展開、メニューは白） */}
            <div
              className="relative group"
              onMouseEnter={()=> setMenuOpen(true)}
            >
              <button
                type="button"
                onClick={()=> { onChange('clients'); setMenuOpen(v=>!v); }}
                className={`flex items-center gap-2 rounded border px-3 py-1.5 text-sm min-w-[200px] justify-between ${active==='clients' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'}`}
              >
                <span className="truncate max-w-[160px]">{currentClient?.name || (loadingClients ? '読み込み中...' : '支援対象者を選択')}</span>
                <span className="text-xs opacity-80">▾</span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-0 w-[240px] rounded-md rounded-t-none border bg-white shadow-lg ring-1 ring-black/5 z-50"
                  onMouseEnter={()=> setMenuOpen(true)}
                  onMouseLeave={()=> setMenuOpen(false)}
                >
                  <div className="max-h-[50vh] overflow-auto py-1">
                    {clients.length === 0 && !loadingClients && (
                      <div className="px-3 py-2 text-xs text-gray-500">支援対象者がいません</div>
                    )}
                    {clients.map(c => (
                      <button
                        key={c.id}
                        onClick={()=> onSelect(c.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {c.name}
                      </button>
                    ))}
                    <div className="my-1 border-t" />
                    <button
                      onClick={()=> onSelect('__add__')}
                      className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-gray-50">
                      新しい支援対象者を追加
                    </button>
                  </div>
                </div>
              )}
            </div>
      {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
        className={`px-3 py-1.5 rounded text-sm transition border ${active === item.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-100'} `}
            >
              {item.label}
            </button>
          ))}
          </nav>
        </div>
        {/* 追加モーダル */}
        {showAdd && typeof window !== 'undefined' && createPortal(
          <div
            className="fixed inset-0 z-[1000] grid place-items-center bg-black/30"
            onClick={()=> { setShowAdd(false); setNewName(''); setNewPhotoUrl(''); }}
          >
            <div
              className="bg-white rounded-lg shadow-lg w-[92%] max-w-sm p-4"
              onClick={(e)=> e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold mb-3">新しい支援対象者を追加</h3>
              <div className="space-y-2">
                <input
                  value={newName}
                  onChange={(e)=> setNewName(e.target.value)}
                  placeholder="氏名"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
                <input
                  value={newPhotoUrl}
                  onChange={(e)=> setNewPhotoUrl(e.target.value)}
                  placeholder="写真URL（任意）"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2 text-sm">
                <button onClick={()=> { setShowAdd(false); setNewName(''); setNewPhotoUrl(''); }} className="px-3 py-1.5 rounded border">キャンセル</button>
                <button onClick={handleAddClient} disabled={adding || !newName.trim()} className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:bg-blue-300">{adding ? '追加中...' : '追加'}</button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </header>
  );
}
