"use client";
import React from 'react';

interface AppHeaderProps {
  active: string;
  onChange: (key: string) => void;
}

const NAV_ITEMS: { key: string; label: string }[] = [
  { key: 'clients', label: '支援者管理' },
  { key: 'notes', label: 'メモ・TODO管理' },
  { key: 'assessment', label: 'アセスメント管理' },
  { key: 'resources', label: '社会資源管理' },
];

export default function AppHeader({ active, onChange }: AppHeaderProps) {
  return (
    <header className="w-full bg-white/80 backdrop-blur border-b sticky top-0 z-30 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="text-lg font-semibold tracking-wide">福祉支援ダッシュボード</div>
        <nav className="flex flex-wrap gap-2 md:ml-auto">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={`px-3 py-1.5 rounded text-sm transition border ${active === item.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-100'} `}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
