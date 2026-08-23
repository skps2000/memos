import { useCallback, useRef, useState } from "react";

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
  handleResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  /** Attach to the handle's pointermove; drags are captured so moves keep flowing. */
  handleResizePointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  /** Attach to the handle's pointerup/pointercancel; persists the final height. */
  handleResizePointerUp: () => void;
  /** Drop the custom height and fall back to the automatic layout. */
  resetCardHeight: () => void;
}

export const useMemoCardHeight = (memoName: string): UseMemoCardHeightReturn => {
  const [cardHeight, setCardHeight] = useState<number | undefined>(() => getMemoCardHeight(memoName));
  const [resizing, setResizing] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; startHeight: number } | null>(null);
  const liveHeightRef = useRef<number | undefined>(cardHeight);
  liveHeightRef.current = cardHeight;

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const card = cardRef.current;
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    // Capture the pointer so every move/up lands on this handle even when the
    // cursor leaves the tiny button mid-drag.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events cannot capture; the on-move/on-up handlers still fire.
    }
    dragStartRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startHeight: card.getBoundingClientRect().height,
    };
    setResizing(true);
  }, []);

  // Both axes feed the height so a diagonal corner drag feels free-form:
  // dragging down-right grows the card, dragging up-left shrinks it.
  const handleResizePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const deltaY = event.clientY - start.startY;
    const deltaX = event.clientX - start.startX;
    setCardHeight(Math.max(MIN_RESIZABLE_CARD_HEIGHT, Math.round(start.startHeight + deltaY + deltaX)));
  }, []);

  const handleResizePointerUp = useCallback(() => {
    const finalHeight = liveHeightRef.current;
    if (finalHeight !== undefined) {
      setMemoCardHeight(memoName, finalHeight);
    }
    dragStartRef.current = null;
    setResizing(false);
  }, [memoName]);

  const resetCardHeight = useCallback(() => {
    setCardHeight(undefined);
    clearMemoCardHeight(memoName);
  }, [memoName]);

  return { cardRef, cardHeight, resizing, handleResizePointerDown, handleResizePointerMove, handleResizePointerUp, resetCardHeight };
};
