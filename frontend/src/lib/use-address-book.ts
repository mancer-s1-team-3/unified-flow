// lib/use-address-book.ts
// Persistent address book hook — stores labeled recipient entries in localStorage.
// Each entry has: address (base58), label (display name), tags (optional), note (optional), addedAt.

import { useCallback, useEffect, useState } from "react";

export type AddressEntry = {
  id: string; // crypto.randomUUID or fallback
  address: string;
  label: string;
  tags: string[];
  note: string;
  addedAt: number; // unix ms
};

const STORAGE_KEY = "uf:address-book:v1";

function loadEntries(): AddressEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AddressEntry[];
  } catch {
    return [];
  }
}

function saveEntries(entries: AddressEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // quota exceeded or private mode — fail silently
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useAddressBook() {
  const [entries, setEntries] = useState<AddressEntry[]>([]);

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    setEntries(loadEntries());
  }, []);

  const persist = useCallback((next: AddressEntry[]) => {
    setEntries(next);
    saveEntries(next);
  }, []);

  const add = useCallback(
    (
      address: string,
      label: string,
      tags: string[] = [],
      note = ""
    ): AddressEntry => {
      const entry: AddressEntry = {
        id: newId(),
        address: address.trim(),
        label: label.trim(),
        tags,
        note,
        addedAt: Date.now(),
      };
      setEntries((prev) => {
        const next = [entry, ...prev];
        saveEntries(next);
        return next;
      });
      return entry;
    },
    []
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<AddressEntry, "id" | "addedAt">>) => {
      setEntries((prev) => {
        const next = prev.map((e) =>
          e.id === id ? { ...e, ...patch } : e
        );
        saveEntries(next);
        return next;
      });
    },
    []
  );

  const remove = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveEntries(next);
      return next;
    });
  }, []);

  /** True if the address already exists in the book (case-insensitive) */
  const has = useCallback(
    (address: string) =>
      entries.some(
        (e) => e.address.toLowerCase() === address.trim().toLowerCase()
      ),
    [entries]
  );

  /** Find by address (case-insensitive) */
  const find = useCallback(
    (address: string) =>
      entries.find(
        (e) => e.address.toLowerCase() === address.trim().toLowerCase()
      ) ?? null,
    [entries]
  );

  return { entries, add, update, remove, has, find };
}