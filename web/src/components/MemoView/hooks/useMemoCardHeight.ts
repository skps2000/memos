import { useCallback, useEffect, useRef, useState } from "react";

// Per-memo user-resized card heights, persisted in localStorage so a resized
// memo keeps its custom size across sessions. Keyed by memo name so each card
// remembers its own size ("해당 카드에 한해서").
const CARD_HEIGHT_STORAGE_KEY = "memos-memo-card-height";

export const MIN_RESIZABLE_CARD_HEIGHT = 120;

type CardHeightMap = Record<string, number>;

const readCardHeights = (): CardHeightMap => {
  try {
    const raw = localStorage.getItem(CARD_HEIGHT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CardHeightMap;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const isValidHeight = (height: number | undefined): height is number =>
  typeof height === "number" && Number.isFinite(height) && height >= MIN_RESIZABLE_CARD_HEIGHT;

export const getMemoCardHeight = (memoName: string): number | undefined => {
  const height = readCardHeights()[memoName];
  return isValidHeight(height) ? Math.round(height) : undefined;
};

export const setMemoCardHeight = (memoName: string, height: number): void => {
  try {
    const next = { ...readCardHeights(), [memoName]: Math.max(MIN_RESIZABLE_CARD_HEIGHT, Math.round(height)) };
    localStorage.setItem(CARD_HEIGHT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode, quota) — resizing just won't persist.
  }
};

export const clearMemoCardHeight = (memoName: string): void => {
  try {
    const next = { ...readCardHeights() };
    delete next[memoName];
    localStorage.setItem(CARD_HEIGHT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures; the in-memory height is already reset.
  }
};

export interface UseMemoCardHeightReturn {
  /** The article ref the resize logic measures against. */
  cardRef: React.RefObject<HTMLDivElement | null>;
  /** Persisted (or live-while-dragging) card height, undefined when untouched. */
  cardHeight: number | undefined;
  /** True while the user is dragging the resize handle. */
  resizing: boolean;
  /** Attach to the bottom-right resize handle's pointerdown. */
  handleResizePointerDown: (event: React.PointerEvent) => void;
  /** Drop the custom height and fall back to the automatic layout. */
  resetCardHeight: () => void;
}

export const useMemoCardHeight = (memoName: string): UseMemoCardHeightReturn => {
  const [cardHeight, setCardHeight] = useState<number | undefined>(() => getMemoCardHeight(memoName));
  const [resizing, setResizing] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const liveHeightRef = useRef<number | undefined>(cardHeight);
  liveHeightRef.current = cardHeight;

  const handleResizePointerDown = useCallback((event: React.PointerEvent) => {
    const card = cardRef.current;
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    dragStartRef.current = { startY: event.clientY, startHeight: card.getBoundingClientRect().height };
    setResizing(true);
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const next = Math.max(MIN_RESIZABLE_CARD_HEIGHT, Math.round(start.startHeight + (event.clientY - start.startY)));
      setCardHeight(next);
    };

    const handlePointerUp = () => {
      const finalHeight = liveHeightRef.current;
      if (finalHeight !== undefined) {
        setMemoCardHeight(memoName, finalHeight);
      }
      dragStartRef.current = null;
      setResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [resizing, memoName]);

  const resetCardHeight = useCallback(() => {
    setCardHeight(undefined);
    clearMemoCardHeight(memoName);
  }, [memoName]);

  return { cardRef, cardHeight, resizing, handleResizePointerDown, resetCardHeight };
};
