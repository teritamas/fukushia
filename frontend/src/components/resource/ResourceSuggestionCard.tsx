import React from 'react';
import { ResourceRecord, SuggestionMeta } from './types';

interface Props {
  resource: ResourceRecord;
  meta?: SuggestionMeta;
  onOpenDetail?: (id: string) => void;
  onAdd?: (res: ResourceRecord) => void;
  addDisabled?: boolean;
}

export default function ResourceSuggestionCard({ resource, meta, onOpenDetail, onAdd, addDisabled }: Props) {
  return (
    <li className="surface border border-gray-100 rounded-lg p-3 text-xs flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={()=> resource.id && onOpenDetail && onOpenDetail(resource.id)}
          className="font-semibold leading-snug break-words text-left underline decoration-dotted hover:text-[var(--brand-600)]"
        >
          {resource.service_name}
          {meta?.badge && <span className="ml-1 chip">{meta.badge}</span>}
        </button>
        {onAdd && (!meta?.alreadyUsed) && (
          <button onClick={()=> onAdd(resource)} disabled={addDisabled} className="border border-blue-400 text-blue-600 bg-white text-[11px] h-8 px-3 rounded hover:bg-blue-50 disabled:opacity-60">追加</button>
        )}
      </div>
      {resource.description && <div className="text-[11px] text-gray-600 line-clamp-2">{resource.description}</div>}
      {meta?.matched && meta.matched.length>0 && (
        <div className="text-[10px] text-gray-500">一致:{meta.matched.slice(0,5).join(', ')}</div>
      )}
      {typeof meta?.score === 'number' && (
        <div className="text-[10px] text-gray-400">スコア:{meta.score}</div>
      )}
    </li>
  );
}
