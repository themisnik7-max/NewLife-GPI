"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, MessageSquare, Search, User } from "lucide-react";
import type { SearchResult, SearchResultKind } from "@/lib/search";
import { searchAction } from "@/app/dashboard/search/actions";

/**
 * Global search — ⌘K / Ctrl-K from anywhere, jump straight to a record.
 *
 * Admin-only: it is rendered only where an admin is signed in, and
 * searchAction re-checks the role server-side and returns an empty list
 * otherwise, so hiding it here is usability rather than the control.
 *
 * Queries are debounced rather than fired per keystroke: each one hits four
 * tables, and typing "Papadopoulos" would otherwise issue twelve searches to
 * answer one question. 200ms is short enough to feel immediate and long
 * enough that a fast typist produces a single request.
 *
 * Results arriving out of order is a real hazard with a debounce — a slow
 * "pap" resolving after a fast "papa" would show the wrong list. Each request
 * is stamped and a stale response is discarded rather than rendered.
 */

const KIND_ICONS: Record<SearchResultKind, typeof User> = {
  client: User,
  property: Building2,
  document: FileText,
  activity: MessageSquare,
};

const KIND_LABELS: Record<SearchResultKind, string> = {
  client: "Clients",
  property: "Properties",
  document: "Files",
  activity: "Activity",
};

const DEBOUNCE_MS = 200;

export function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
      }
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    else {
      setQuery("");
      setResults([]);
      setHighlighted(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      try {
        const found = await searchAction(term);
        // Discard a response that arrived after a newer request was issued.
        if (id !== requestId.current) return;
        setResults(found);
        setHighlighted(0);
      } catch {
        if (id !== requestId.current) return;
        setResults([]);
      } finally {
        if (id === requestId.current) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  function go(result: SearchResult): void {
    setIsOpen(false);
    router.push(result.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[highlighted]);
    }
  }

  // Results arrive already ordered by kind from searchTenant, so grouping is
  // a partition rather than a sort.
  const grouped = (Object.keys(KIND_LABELS) as SearchResultKind[])
    .map((kind) => ({ kind, items: results.filter((result) => result.kind === kind) }))
    .filter((group) => group.items.length > 0);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-stone-0 px-3 py-1.5 text-sm text-stone-500 transition-colors hover:bg-stone-50"
      >
        <Search size={15} aria-hidden="true" />
        Search
        <kbd className="ml-1 rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-sans text-[11px] text-stone-400">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search everything"
      className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/30 p-4 pt-[12vh]"
      onClick={(event) => {
        if (event.target === event.currentTarget) setIsOpen(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-stone-0 shadow-xl">
        <div className="flex items-center gap-2 border-b border-stone-200 px-4">
          <Search size={17} className="shrink-0 text-stone-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search clients, properties, files, activity…"
            aria-label="Search everything"
            className="w-full bg-transparent py-3.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none"
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="px-4 py-6 text-center text-sm text-stone-400">
              Type at least two characters.
            </p>
          ) : isSearching ? (
            <p className="px-4 py-6 text-center text-sm text-stone-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-stone-400">
              Nothing found for “{query.trim()}”.
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.kind}>
                <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  {KIND_LABELS[group.kind]}
                </p>
                <ul>
                  {group.items.map((result) => {
                    const Icon = KIND_ICONS[result.kind];
                    const index = results.indexOf(result);
                    return (
                      <li key={`${result.kind}-${result.id}`}>
                        <button
                          type="button"
                          onClick={() => go(result)}
                          onMouseEnter={() => setHighlighted(index)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                            index === highlighted ? "bg-aegean-50" : "hover:bg-stone-50"
                          }`}
                        >
                          <Icon size={15} className="shrink-0 text-stone-400" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-stone-900">
                              {result.title}
                            </span>
                            <span className="block truncate text-xs text-stone-500">
                              {result.subtitle}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
