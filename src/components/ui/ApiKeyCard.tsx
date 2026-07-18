"use client";

import { useState } from "react";
import { KeyRound, Copy, Check, RefreshCw } from "lucide-react";

export type ApiKeyProvider = "anthropic" | "openai";
export type ApiKeyStatus = "active" | "revoked";

export interface ApiKeyCardData {
  id: string;
  provider: ApiKeyProvider;
  label: string;
  /**
   * Display-only masked value, e.g. "sk-ant-••••••••wq7A". The real secret is
   * decrypted server-side only (see ARCHITECTURE.md, encrypted_api_keys) and
   * must never reach this component.
   */
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: ApiKeyStatus;
}

// Hardcoded mock — no encryption/decryption or network calls happen here.
export const MOCK_API_KEY: ApiKeyCardData = {
  id: "key_7f3a1c",
  provider: "anthropic",
  label: "Production — Anthropic",
  maskedKey: "sk-ant-••••••••••••wq7A",
  createdAt: "3 May 2026",
  lastUsedAt: "18 Jul 2026",
  status: "active",
};

const PROVIDER_LABEL: Record<ApiKeyProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

export interface ApiKeyCardProps {
  apiKey?: ApiKeyCardData;
  onRotate?: (id: string) => void;
  onRevoke?: (id: string) => void;
}

export function ApiKeyCard({ apiKey = MOCK_API_KEY, onRotate, onRevoke }: ApiKeyCardProps) {
  const [copied, setCopied] = useState(false);
  const isRevoked = apiKey.status === "revoked";

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(apiKey.maskedKey).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-0 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-aegean-50 text-aegean-700">
            <KeyRound size={18} aria-hidden="true" />
          </div>
          <div>
            <div className="font-semibold text-stone-900">{apiKey.label}</div>
            <div className="text-xs text-stone-500">{PROVIDER_LABEL[apiKey.provider]} · Bring Your Own Key</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
            isRevoked ? "bg-coral-100 text-coral-700" : "bg-olive-100 text-olive-700"
          }`}
        >
          {isRevoked ? "Revoked" : "Active"}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-stone-50 px-3 py-2.5">
        <code className="font-mono text-sm text-stone-700">{apiKey.maskedKey}</code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy masked key reference"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-900"
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-stone-500">
        <span>Added {apiKey.createdAt}</span>
        <span aria-hidden="true">·</span>
        <span>{apiKey.lastUsedAt ? `Last used ${apiKey.lastUsedAt}` : "Never used"}</span>
      </div>

      <div className="mt-5 flex gap-2 border-t border-stone-100 pt-4">
        <button
          type="button"
          onClick={() => onRotate?.(apiKey.id)}
          disabled={isRevoked}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Rotate key
        </button>
        <button
          type="button"
          onClick={() => onRevoke?.(apiKey.id)}
          disabled={isRevoked}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-coral-600 transition-colors hover:bg-coral-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Revoke
        </button>
      </div>
    </div>
  );
}
