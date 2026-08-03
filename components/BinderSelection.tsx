"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type BinderSelectionValue = {
  active: boolean;
  toggleActive: () => void;
  selected: Map<string, number | null>;
  toggle: (cardId: string, price: number | null) => void;
  clear: () => void;
};

const noop = () => {};

// Selection is off by default and this context has a harmless no-op default
// so `CardTile` can call `useBinderSelection()` unconditionally even on
// pages (watchlist, set detail) that don't wrap it in a provider.
const BinderSelectionContext = createContext<BinderSelectionValue>({
  active: false,
  toggleActive: noop,
  selected: new Map(),
  toggle: noop,
  clear: noop,
});

export function BinderSelectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Map<string, number | null>>(new Map());

  const value = useMemo<BinderSelectionValue>(
    () => ({
      active,
      toggleActive: () => {
        setActive((prev) => !prev);
        setSelected(new Map());
      },
      selected,
      toggle: (cardId, price) => {
        setSelected((prev) => {
          const next = new Map(prev);
          if (next.has(cardId)) next.delete(cardId);
          else next.set(cardId, price);
          return next;
        });
      },
      clear: () => setSelected(new Map()),
    }),
    [active, selected]
  );

  return <BinderSelectionContext.Provider value={value}>{children}</BinderSelectionContext.Provider>;
}

export function useBinderSelection() {
  return useContext(BinderSelectionContext);
}
