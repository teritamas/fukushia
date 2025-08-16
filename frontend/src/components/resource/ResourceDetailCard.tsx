import React from "react";
import { ResourceRecord } from "./types";

interface Props {
  resource: ResourceRecord | null;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export default function ResourceDetailCard({
  resource,
  loading,
  error,
  onClose,
  children,
  footer,
}: Props) {
  return (
    <div className="relative z-10 w-full max-w-lg bg-[var(--surface)] card-shadow rounded-xl border border-[var(--border)] p-5 overflow-y-auto max-h-full space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h4 className="font-bold section-title text-sm">社会資源・制度詳細</h4>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm text-[var(--foreground)] h-8"
          >
            ×
          </button>
        )}
      </div>
      {loading && <p className="text-[var(--muted)]">読込中...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && !error && resource && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">
              名称
            </div>
            <div className="text-sm font-semibold">{resource.service_name}</div>
          </div>
          {resource.category && (
            <div>
              <span className="font-semibold text-[var(--muted)] mr-1">
                分類:
              </span>
              <span>{resource.category}</span>
            </div>
          )}
          {resource.target_users && (
            <div>
              <span className="font-semibold text-[var(--muted)] mr-1">
                対象:
              </span>
              <span>{resource.target_users}</span>
            </div>
          )}
          {resource.description && (
            <div>
              <span className="font-semibold text-[var(--muted)] mr-1">
                概要:
              </span>
              <span className="whitespace-pre-wrap break-words">
                {resource.description}
              </span>
            </div>
          )}
          {resource.eligibility && (
            <div>
              <span className="font-semibold text-[var(--muted)] mr-1">
                要件:
              </span>
              <span className="whitespace-pre-wrap break-words">
                {resource.eligibility}
              </span>
            </div>
          )}
          {resource.application_process && (
            <div>
              <span className="font-semibold text-[var(--muted)] mr-1">
                手続:
              </span>
              <span className="whitespace-pre-wrap break-words">
                {resource.application_process}
              </span>
            </div>
          )}
          {resource.provider && (
            <div>
              <span className="font-semibold text-[var(--muted)] mr-1">
                分類:
              </span>
              <span>{resource.provider}</span>
            </div>
          )}
          {resource.location && (
            <div>
              <span className="font-semibold text-[var(--muted)] mr-1">
                提供主体:
              </span>
              <span>{resource.location}</span>
            </div>
          )}
          {(resource.contact_phone ||
            resource.contact_email ||
            resource.contact_url) && (
            <div className="space-y-1">
              <div className="font-semibold text-[var(--muted)]">連絡先</div>
              {resource.contact_phone && (
                <div>電話: {resource.contact_phone}</div>
              )}
              {resource.contact_email && (
                <div>メール: {resource.contact_email}</div>
              )}
              {resource.contact_url && (
                <div className="truncate">
                  URL:{" "}
                  <a
                    href={resource.contact_url}
                    target="_blank"
                    className="text-[var(--brand-600)] underline break-all"
                  >
                    {resource.contact_url}
                  </a>
                </div>
              )}
            </div>
          )}
          {resource.keywords && resource.keywords.length > 0 && (
            <div>
              <span className="font-semibold text-[var(--muted)] mr-1">
                地域/所在地:
              </span>
              <span className="font-semibold text-[var(--muted)] mr-1">
                キーワード:
              </span>
              <span className="flex flex-wrap gap-1">
                {resource.keywords.slice(0, 30).map((k: string) => (
                  <span key={k} className="chip text-[11px]">
                    {k}
                  </span>
                ))}
              </span>
            </div>
          )}
          {resource.last_verified_at && (
            <div className="text-[10px] text-[var(--muted)]">
              最終確認:{" "}
              {new Date(resource.last_verified_at * 1000).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
      {(footer || onClose) && (
        <div className="mt-4 pt-3 flex justify-end gap-2">
          {footer ? (
            footer
          ) : onClose ? (
            <button className="gbtn text text-[11px] h-8" onClick={onClose}>
              閉じる
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
