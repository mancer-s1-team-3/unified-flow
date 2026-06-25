"use client";

/**
 * AddressBookPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Full address-book UI for Unified Flow. Drop this anywhere a recipient address
 * is entered. Exposes an `onSelect` callback so the parent can inject the
 * chosen address into any form field.
 *
 * Usage (e.g. inside DashboardActionPanels beside the Recipient input):
 *
 *   import { AddressBookPanel } from "@/components/dashboard/address-book-panel";
 *   import { useAddressBook } from "@/lib/use-address-book";
 *
 *   const book = useAddressBook();
 *   <AddressBookPanel
 *     book={book}
 *     currentAddress={createForm.recipient}
 *     onSelect={(addr) => setCreateForm({ ...createForm, recipient: addr })}
 *   />
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookUser,
  Check,
  ChevronDown,
  Copy,
  Pencil,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  UserCircle2,
  X,
  XCircle,
} from "lucide-react";
import type { AddressEntry } from "@/lib/use-address-book";

// ─── Validation helpers (mirrors dashboard-action-panels.tsx) ─────────────
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function isValidSolanaAddress(address: string): boolean {
  const a = address?.trim();
  if (!a || !BASE58_REGEX.test(a)) return false;
  try {
    // Dynamic import not available in component body — use a lightweight check
    // that catches the most common bad inputs without importing PublicKey.
    // Full validation still happens in the form submit guard via PublicKey.
    return a.length >= 32 && a.length <= 44;
  } catch {
    return false;
  }
}

function shortenAddress(addr: string, head = 6, tail = 4) {
  if (!addr) return "";
  return addr.length > head + tail + 3
    ? `${addr.slice(0, head)}…${addr.slice(-tail)}`
    : addr;
}

// ─── Tag chip ─────────────────────────────────────────────────────────────
const TAG_PALETTE = [
  "bg-indigo-500/15 text-indigo-300 border-indigo-500/25",
  "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  "bg-amber-500/15 text-amber-300 border-amber-500/25",
  "bg-violet-500/15 text-violet-300 border-violet-500/25",
  "bg-rose-500/15 text-rose-300 border-rose-500/25",
  "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
];
function tagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + (hash << 5) - hash;
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}
function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider ${tagColor(
        tag
      )}`}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-60 hover:opacity-100 transition-opacity"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

// ─── Entry form (add / edit) ───────────────────────────────────────────────
type EntryFormState = {
  address: string;
  label: string;
  tagInput: string;
  tags: string[];
  note: string;
};

/** The serialisable subset of EntryFormState that gets saved / passed upward */
type EntryFormData = {
  address: string;
  label: string;
  tags: string[];
  note: string;
};

function EntryForm({
  initial,
  onSave,
  onCancel,
  disableAddressEdit = false,
}: {
  initial?: Partial<EntryFormState>;
  onSave: (data: EntryFormData) => void;
  onCancel: () => void;
  disableAddressEdit?: boolean;
}) {
  const [form, setForm] = useState<EntryFormState>({
    address: initial?.address ?? "",
    label: initial?.label ?? "",
    tagInput: "",
    tags: initial?.tags ?? [],
    note: initial?.note ?? "",
  });

  const addressInvalid =
    form.address.trim().length > 0 && !isValidSolanaAddress(form.address);

  const canSave =
    form.address.trim().length > 0 &&
    form.label.trim().length > 0 &&
    !addressInvalid;

  const addTag = () => {
    const t = form.tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || form.tags.includes(t) || form.tags.length >= 5) return;
    setForm((f) => ({ ...f, tags: [...f.tags, t], tagInput: "" }));
  };

  return (
    <div className="space-y-3">
      {/* Address */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
          Wallet Address
        </label>
        <input
          type="text"
          disabled={disableAddressEdit}
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          placeholder="Paste Solana address (base58)"
          className={`w-full bg-zinc-950 border rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            addressInvalid
              ? "border-rose-500/60 focus:border-rose-500"
              : "border-zinc-800 focus:border-indigo-500"
          }`}
        />
        {addressInvalid && (
          <p className="mt-1 text-[10px] text-rose-400">
            Not a valid Solana address.
          </p>
        )}
      </div>

      {/* Label */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
          Display Name
        </label>
        <input
          type="text"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="e.g. Investor A, Team Wallet"
          maxLength={40}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
          Tags{" "}
          <span className="normal-case font-normal text-zinc-600">
            (max 5)
          </span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.tagInput}
            onChange={(e) =>
              setForm((f) => ({ ...f, tagInput: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="team, investor, vesting…"
            maxLength={20}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="button"
            onClick={addTag}
            disabled={!form.tagInput.trim() || form.tags.length >= 5}
            className="px-3 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all text-[10px] font-bold disabled:opacity-30"
          >
            Add
          </button>
        </div>
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {form.tags.map((t) => (
              <TagChip
                key={t}
                tag={t}
                onRemove={() =>
                  setForm((f) => ({
                    ...f,
                    tags: f.tags.filter((x) => x !== t),
                  }))
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Note */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
          Note{" "}
          <span className="normal-case font-normal text-zinc-600">
            (optional)
          </span>
        </label>
        <textarea
          rows={2}
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder="e.g. Seed round investor, 12-month cliff"
          maxLength={120}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-indigo-500 transition-colors resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              address: form.address.trim(),
              label: form.label.trim(),
              tags: form.tags,
              note: form.note.trim(),
            })
          }
          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-all bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Single address card ───────────────────────────────────────────────────
function EntryCard({
  entry,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  entry: AddressEntry;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(entry.address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-2xl border transition-all cursor-pointer select-none ${
        isSelected
          ? "border-indigo-500/60 bg-indigo-950/20 shadow-lg shadow-indigo-900/20"
          : "border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 hover:bg-zinc-900/40"
      }`}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-black border transition-colors ${
            isSelected
              ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
              : "bg-zinc-900 border-zinc-800 text-zinc-400 group-hover:border-zinc-700"
          }`}
        >
          {entry.label.slice(0, 2).toUpperCase()}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-bold truncate ${
                isSelected ? "text-indigo-200" : "text-zinc-200"
              }`}
            >
              {entry.label}
            </span>
            {isSelected && (
              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                Selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[10px] text-zinc-500">
              {shortenAddress(entry.address)}
            </span>
            <button
              type="button"
              onClick={copy}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300"
              title="Copy address"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {entry.tags.map((t) => (
                <TagChip key={t} tag={t} />
              ))}
            </div>
          )}

          {/* Note */}
          {entry.note && (
            <p className="mt-1 text-[10px] text-zinc-600 leading-relaxed line-clamp-1">
              {entry.note}
            </p>
          )}
        </div>

        {/* Actions (shown on hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            title="Edit"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-all"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirmation inline banner ────────────────────────────────────
function DeleteConfirm({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-[11px] text-rose-300/80 leading-relaxed min-w-0">
        Remove{" "}
        <span className="font-bold text-rose-300 truncate">{label}</span> from
        address book?
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 transition-all"
        >
          Keep
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export type AddressBookPanelProps = {
  /** The hook return value from useAddressBook() */
  book: {
    entries: AddressEntry[];
    add: (
      address: string,
      label: string,
      tags?: string[],
      note?: string
    ) => AddressEntry;
    update: (
      id: string,
      patch: Partial<Omit<AddressEntry, "id" | "addedAt">>
    ) => void;
    remove: (id: string) => void;
    has: (address: string) => boolean;
    find: (address: string) => AddressEntry | null;
  };
  /** The current recipient address in the parent form (to highlight the match) */
  currentAddress?: string;
  /**
   * Called when user clicks an entry to use it.
   * Parent should set the recipient field to this address.
   */
  onSelect: (address: string) => void;
  /** If true, render as a collapsible panel (default: true) */
  collapsible?: boolean;
  /** Default collapsed state (default: true) */
  defaultCollapsed?: boolean;
};

export function AddressBookPanel({
  book,
  currentAddress = "",
  onSelect,
  collapsible = true,
  defaultCollapsed = true,
}: AddressBookPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const [editTarget, setEditTarget] = useState<AddressEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AddressEntry | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // All unique tags across the book for the filter strip
  const allTags = useMemo(() => {
    const set = new Set<string>();
    book.entries.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [book.entries]);

  // Filtered & searched entries
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return book.entries.filter((e) => {
      const matchesQuery =
        !q ||
        e.label.toLowerCase().includes(q) ||
        e.address.toLowerCase().includes(q) ||
        e.note.toLowerCase().includes(q) ||
        e.tags.some((t) => t.includes(q));
      const matchesTag = !activeTag || e.tags.includes(activeTag);
      return matchesQuery && matchesTag;
    });
  }, [book.entries, query, activeTag]);

  // Focus search when panel opens
  useEffect(() => {
    if (!collapsed && mode === "list") {
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [collapsed, mode]);

  // "Quick-add" from currentAddress if not already in book
  const canQuickAdd =
    currentAddress.trim().length > 0 &&
    isValidSolanaAddress(currentAddress) &&
    !book.has(currentAddress);

  const handleQuickAdd = () => {
    setEditTarget(null);
    setMode("add");
  };

  const handleSaveAdd = (data: EntryFormData) => {
    book.add(data.address, data.label, data.tags, data.note);
    setMode("list");
  };

  const handleSaveEdit = (data: EntryFormData) => {
    if (!editTarget) return;
    book.update(editTarget.id, {
      label: data.label,
      tags: data.tags,
      note: data.note,
    });
    setEditTarget(null);
    setMode("list");
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    book.remove(deleteTarget.id);
    setDeleteTarget(null);
  };

  const headerLabel =
    book.entries.length === 0
      ? "Address Book"
      : `Address Book · ${book.entries.length}`;

  return (
    <div className="rounded-2xl border border-zinc-800 overflow-hidden transition-all duration-200 animate-in fade-in">
      {/* ── Header / toggle ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => {
          if (collapsible) setCollapsed((c) => !c);
        }}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-900 bg-zinc-950/80 text-left transition-colors ${
          collapsible ? "hover:bg-zinc-900/50 cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2">
          <BookUser className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
            {headerLabel}
          </span>
          {canQuickAdd && !collapsed && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-400">
              Current address not saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!collapsed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditTarget(null);
                setMode("add");
                setCollapsed(false);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-400 hover:text-indigo-200 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20 transition-all"
              title="Add address"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          )}
          {collapsible && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-zinc-600 transition-transform duration-200 ${
                collapsed ? "" : "rotate-180"
              }`}
            />
          )}
        </div>
      </button>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="bg-zinc-950/40">
          {/* ── Add / Edit form ─────────────────────────────────────────── */}
          {(mode === "add" || mode === "edit") && (
            <div className="px-4 pt-4 pb-3 border-b border-zinc-900">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  {mode === "add" ? "New Contact" : "Edit Contact"}
                </span>
                <div className="flex-1 h-px bg-zinc-900" />
              </div>
              <EntryForm
                initial={
                  mode === "edit" && editTarget
                    ? {
                        address: editTarget.address,
                        label: editTarget.label,
                        tags: editTarget.tags,
                        note: editTarget.note,
                      }
                    : canQuickAdd && mode === "add"
                    ? { address: currentAddress }
                    : undefined
                }
                disableAddressEdit={mode === "edit"}
                onSave={mode === "add" ? handleSaveAdd : handleSaveEdit}
                onCancel={() => {
                  setMode("list");
                  setEditTarget(null);
                }}
              />
            </div>
          )}

          {/* ── List mode ────────────────────────────────────────────────── */}
          {mode === "list" && (
            <>
              {/* Search + tag filter */}
              {book.entries.length > 0 && (
                <div className="px-4 pt-3 pb-2 space-y-2 border-b border-zinc-900/60">
                  <div className="relative">
                    <Search className="absolute left-3 inset-y-0 my-auto w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, address, or note…"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-8 py-2 text-xs focus:outline-none focus:border-indigo-500 transition-colors font-mono placeholder:font-sans"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="absolute right-3 inset-y-0 my-auto text-zinc-600 hover:text-zinc-300 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Tag filter pills */}
                  {allTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveTag(null)}
                        className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all ${
                          !activeTag
                            ? "bg-zinc-800 border-zinc-700 text-zinc-200"
                            : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        All
                      </button>
                      {allTags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setActiveTag(activeTag === t ? null : t)
                          }
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all ${
                            activeTag === t
                              ? `${tagColor(t)}`
                              : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Delete confirm banner */}
              {deleteTarget && (
                <div className="px-4 pt-3">
                  <DeleteConfirm
                    label={deleteTarget.label}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                  />
                </div>
              )}

              {/* Entry list */}
              <div className="px-4 py-3 space-y-2 max-h-[400px] overflow-y-auto">
                {book.entries.length === 0 ? (
                  /* Empty state */
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                      <UserCircle2 className="w-6 h-6 text-zinc-700" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-400">
                        No saved addresses
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        Save recipients here to reuse them across streams.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMode("add")}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all"
                    >
                      <Plus className="w-3 h-3" />
                      Add first address
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  /* No search results */
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <Search className="w-5 h-5 text-zinc-700" />
                    <p className="text-[11px] text-zinc-500">
                      No matches for{" "}
                      <span className="font-bold text-zinc-400">
                        &ldquo;{query}&rdquo;
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setActiveTag(null);
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  filtered.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      isSelected={
                        entry.address.toLowerCase() ===
                        currentAddress.trim().toLowerCase()
                      }
                      onSelect={() => onSelect(entry.address)}
                      onEdit={() => {
                        setEditTarget(entry);
                        setMode("edit");
                      }}
                      onDelete={() => {
                        setDeleteTarget(entry);
                      }}
                    />
                  ))
                )}
              </div>

              {/* Quick-add CTA when currentAddress isn't saved */}
              {canQuickAdd && book.entries.length > 0 && (
                <div className="px-4 pb-3 pt-0">
                  <button
                    type="button"
                    onClick={handleQuickAdd}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-indigo-500/30 text-[10px] font-bold text-indigo-400 hover:border-indigo-500/60 hover:bg-indigo-500/5 transition-all"
                  >
                    <Star className="w-3 h-3" />
                    Save{" "}
                    <span className="font-mono">
                      {shortenAddress(currentAddress)}
                    </span>{" "}
                    to address book
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}