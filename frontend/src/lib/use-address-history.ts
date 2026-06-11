"use client";

import { useCallback, useEffect, useState } from "react";

const MAX_ENTRIES = 10;

/**
 * Persists a small list of recently-used addresses in localStorage so inputs
 * can offer them again via a native <datalist> autocomplete.
 *
 * Pass a unique `key` per field family (e.g. "recipient", "mint") to keep
 * their histories separate.
 */
export function useAddressHistory(key: string) {
  const storageKey = `uf:address-history:${key}`;
  const [addresses, setAddresses] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setAddresses(parsed.filter((a) => typeof a === "string"));
      }
    } catch {
      // ignore malformed / unavailable storage
    }
  }, [storageKey]);

  const remember = useCallback(
    (address: string) => {
      const trimmed = address.trim();
      if (!trimmed) return;
      setAddresses((prev) => {
        const next = [trimmed, ...prev.filter((a) => a !== trimmed)].slice(0, MAX_ENTRIES);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore quota / unavailable storage
        }
        return next;
      });
    },
    [storageKey]
  );

  const remove = useCallback(
    (address: string) => {
      setAddresses((prev) => {
        const next = prev.filter((a) => a !== address);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey]
  );

  return { addresses, remember, remove };
}
