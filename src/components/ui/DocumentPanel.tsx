"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  DOCUMENT_ACCEPT_ATTRIBUTE,
  MAX_DOCUMENT_BYTES,
  categoriesForEntityType,
  formatFileSize,
  isAcceptedDocumentType,
  type DocumentEntityType,
  type DocumentView,
} from "@/lib/documents";
import { AdminError, ADMIN_FIELD_CLASS, useAdminAction } from "@/components/ui/adminControls";
import {
  deleteDocumentAction,
  getDocumentUrlAction,
  updateDocumentAction,
  uploadDocumentAction,
} from "@/app/dashboard/documents/actions";

/**
 * The Files panel — attaches to any record (property, client, payment,
 * construction milestone) and shows every document filed against it.
 *
 * Two view modes, as monday's file column has: a dense list for scanning
 * paperwork, and a gallery for construction progress photos, where the
 * filename is meaningless and the thumbnail is the whole point.
 *
 * READ-ONLY BY DEFAULT. `canManage` gates every mutating control, and the
 * server re-checks admin role on each action anyway — hiding a control is a
 * usability decision, never a security one.
 *
 * Thumbnails are deliberately NOT rendered eagerly. Every image needs its own
 * signed URL, minted one server round-trip at a time; a gallery of thirty
 * progress photos would fire thirty actions on mount. They load on demand
 * instead, and `loadedUrls` caches what has already been fetched so a second
 * click on the same file is free.
 */

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export interface DocumentPanelProps {
  documents: DocumentView[];
  entityType: DocumentEntityType;
  entityId: string;
  /** Admin-only: shows the dropzone and per-file destructive controls. */
  canManage?: boolean;
  /** False when SUPABASE_SECRET_KEY is unset — the panel then explains
   * itself instead of failing on click, matching ClientAdminPanel. */
  storageConfigured?: boolean;
  /** Optional heading override, e.g. "Progress photos". */
  title?: string;
}

export function DocumentPanel({
  documents,
  entityType,
  entityId,
  canManage = false,
  storageConfigured = true,
  title = "Files",
}: DocumentPanelProps) {
  const router = useRouter();
  const { error, isPending, run } = useAdminAction();
  const [mode, setMode] = useState<"list" | "gallery">("list");
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loadedUrls, setLoadedUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = categoriesForEntityType(entityType);

  /**
   * Client-side validation is a courtesy, not a control — src/lib/storage.ts
   * re-checks both type and size server-side, because a hand-rolled request
   * never runs this code at all. Its value is that the user finds out before
   * a 25 MB upload rather than after.
   */
  function acceptFile(file: File | null | undefined): void {
    setLocalError(null);
    if (!file) return;
    if (!isAcceptedDocumentType(file.type)) {
      setLocalError(`"${file.name}" is not a PDF or a supported image.`);
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setLocalError(`"${file.name}" is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setPendingFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }

  /**
   * Builds the multipart payload by hand from an `onSubmit` handler rather
   * than using React's `<form action={fn}>` form-action prop. That prop is a
   * React 19 feature; this project is on React 18.3.1, where React treats a
   * function passed to `action` as an unknown attribute and never calls it —
   * the form would silently do nothing. `onSubmit` behaves identically across
   * both versions.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!pendingFile) {
      setLocalError("Choose a file first.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    // Set explicitly rather than relying on the input's own `name`: the file
    // held in state is the one that survived validation, and on the
    // drag-and-drop path it never passed through the input at all.
    formData.set("file", pendingFile);
    formData.set("entityType", entityType);
    formData.set("entityId", entityId);

    run(
      () => uploadDocumentAction(formData),
      () => {
        setPendingFile(null);
        form.reset();
        router.refresh();
      },
    );
  }

  /** Opens a document in a new tab through a freshly minted signed URL. */
  function handleOpen(documentId: string): void {
    run(async () => {
      const url = await getDocumentUrlAction(documentId);
      setLoadedUrls((current) => ({ ...current, [documentId]: url }));
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  /** Fetches a thumbnail URL on demand — see the note on eager loading above. */
  function handleLoadThumbnail(documentId: string): void {
    if (loadedUrls[documentId]) return;
    run(async () => {
      const url = await getDocumentUrlAction(documentId);
      setLoadedUrls((current) => ({ ...current, [documentId]: url }));
    });
  }

  function handleToggleVisibility(doc: DocumentView): void {
    run(
      () =>
        updateDocumentAction(doc.id, entityType, entityId, {
          visibleToClient: !doc.visibleToClient,
        }),
      () => router.refresh(),
    );
  }

  function handleDelete(doc: DocumentView): void {
    // Deleting removes the stored object too and there is no undo, so this
    // confirms rather than trusting a mis-click.
    if (!window.confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;
    run(() => deleteDocumentAction(doc.id, entityType, entityId), () => router.refresh());
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-stone-0 p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {title}
          <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
            {documents.length}
          </span>
        </h3>

        <div className="flex items-center gap-1 rounded-md border border-stone-200 p-0.5">
          <button
            type="button"
            onClick={() => setMode("list")}
            aria-pressed={mode === "list"}
            aria-label="List view"
            className={`rounded p-1.5 transition-colors ${
              mode === "list" ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-800"
            }`}
          >
            <List size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setMode("gallery")}
            aria-pressed={mode === "gallery"}
            aria-label="Gallery view"
            className={`rounded p-1.5 transition-colors ${
              mode === "gallery" ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:text-stone-800"
            }`}
          >
            <LayoutGrid size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <AdminError message={error ?? localError} />

      {canManage && !storageConfigured && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          File storage is not configured, so uploads are unavailable. Everything else on this page
          works normally.
        </p>
      )}

      {canManage && storageConfigured && (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              isDragging ? "border-aegean-500 bg-aegean-50" : "border-stone-300 bg-stone-50"
            }`}
          >
            <UploadCloud size={22} className="text-stone-400" aria-hidden="true" />
            <p className="mt-2 text-sm text-stone-600">
              {pendingFile ? (
                <span className="font-medium text-stone-900">
                  {pendingFile.name}{" "}
                  <span className="font-normal text-stone-500">
                    ({formatFileSize(pendingFile.size)})
                  </span>
                </span>
              ) : (
                "Drag a file here, or"
              )}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1.5 text-sm font-semibold text-aegean-600 hover:text-aegean-700"
            >
              {pendingFile ? "Choose a different file" : "browse your computer"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={DOCUMENT_ACCEPT_ATTRIBUTE}
              onChange={(event) => acceptFile(event.target.files?.[0])}
              // sr-only, not `hidden`. `display: none` would remove the only
              // real file control from the accessibility tree, leaving a
              // screen-reader or keyboard user with just the decorative
              // "browse" button. sr-only keeps it focusable and operable
              // while taking no layout space.
              className="sr-only"
              aria-label="Choose a file to upload"
            />
            <p className="mt-2 text-xs text-stone-400">
              PDF or image, up to {MAX_DOCUMENT_BYTES / 1024 / 1024} MB
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-stone-700">Category</span>
              <select name="category" defaultValue={categories[0]?.key} className={ADMIN_FIELD_CLASS}>
                {categories.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-stone-700">Description (optional)</span>
              <input
                type="text"
                name="description"
                placeholder="e.g. Signed original, 12 June"
                className={ADMIN_FIELD_CLASS}
              />
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" name="visibleToClient" className="mt-0.5" />
            <span>
              Visible to the client
              <span className="block text-xs text-stone-500">
                Off by default. Leave unchecked for internal files the client should not see.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={isPending || !pendingFile}
            className="self-start rounded-md bg-aegean-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-aegean-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Uploading…" : "Upload file"}
          </button>
        </form>
      )}

      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">No files yet.</p>
      ) : mode === "list" ? (
        <ul className="mt-4 flex flex-col divide-y divide-stone-100">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="text-stone-400" aria-hidden="true">
                {doc.isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
              </span>

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => handleOpen(doc.id)}
                  disabled={isPending}
                  className="truncate text-left text-sm font-medium text-stone-900 hover:text-aegean-700 hover:underline disabled:opacity-60"
                >
                  {doc.filename}
                </button>
                <p className="mt-0.5 truncate text-xs text-stone-500">
                  {doc.categoryLabel} · {formatFileSize(doc.sizeBytes)} ·{" "}
                  {dateFormatter.format(new Date(doc.createdAt))} · {doc.uploadedByName}
                  {doc.description ? ` · ${doc.description}` : ""}
                </p>
              </div>

              {canManage && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    doc.visibleToClient ? "bg-green-50 text-green-700" : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {doc.visibleToClient ? (
                    <Eye size={11} aria-hidden="true" />
                  ) : (
                    <EyeOff size={11} aria-hidden="true" />
                  )}
                  {doc.visibleToClient ? "Shared" : "Internal"}
                </span>
              )}

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleOpen(doc.id)}
                  disabled={isPending}
                  aria-label={`Download ${doc.filename}`}
                  className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-60"
                >
                  <Download size={15} aria-hidden="true" />
                </button>

                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(doc)}
                      disabled={isPending}
                      aria-label={
                        doc.visibleToClient
                          ? `Stop sharing ${doc.filename} with the client`
                          : `Share ${doc.filename} with the client`
                      }
                      className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-60"
                    >
                      {doc.visibleToClient ? (
                        <EyeOff size={15} aria-hidden="true" />
                      ) : (
                        <Eye size={15} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      disabled={isPending}
                      aria-label={`Delete ${doc.filename}`}
                      className="rounded p-1.5 text-stone-500 transition-colors hover:bg-coral-100 hover:text-coral-700 disabled:opacity-60"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {documents.map((doc) => (
            <li key={doc.id} className="overflow-hidden rounded-lg border border-stone-200">
              <button
                type="button"
                onClick={() => (doc.isImage ? handleLoadThumbnail(doc.id) : handleOpen(doc.id))}
                disabled={isPending}
                className="flex h-28 w-full items-center justify-center bg-stone-100 transition-colors hover:bg-stone-200 disabled:opacity-60"
              >
                {doc.isImage && loadedUrls[doc.id] ? (
                  /* next/image is not usable here: the src is a short-lived
                  signed URL on a runtime-configured Supabase host, which would
                  need that host listed in next.config.js remotePatterns, and
                  next/image would try to cache a URL that expires in 60
                  seconds. The disable must be the line immediately above the
                  element to apply. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={loadedUrls[doc.id]}
                    alt={doc.description ?? doc.filename}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-stone-400">
                    {doc.isImage ? <ImageIcon size={22} /> : <FileText size={22} />}
                    <span className="text-[11px] font-medium">
                      {doc.isImage ? "Show preview" : "Open"}
                    </span>
                  </span>
                )}
              </button>

              <div className="p-2">
                <p className="truncate text-xs font-medium text-stone-900" title={doc.filename}>
                  {doc.filename}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-stone-500">
                  {doc.categoryLabel} · {formatFileSize(doc.sizeBytes)}
                </p>

                {canManage && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(doc)}
                      disabled={isPending}
                      aria-label={
                        doc.visibleToClient
                          ? `Stop sharing ${doc.filename} with the client`
                          : `Share ${doc.filename} with the client`
                      }
                      className="rounded p-1 text-stone-500 transition-colors hover:bg-stone-100 disabled:opacity-60"
                    >
                      {doc.visibleToClient ? (
                        <Eye size={13} aria-hidden="true" />
                      ) : (
                        <EyeOff size={13} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      disabled={isPending}
                      aria-label={`Delete ${doc.filename}`}
                      className="rounded p-1 text-stone-500 transition-colors hover:bg-coral-100 hover:text-coral-700 disabled:opacity-60"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
