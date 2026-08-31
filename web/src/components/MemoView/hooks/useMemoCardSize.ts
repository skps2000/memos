import { useCallback, useEffect, useRef, useState } from "react";
import { clampCardHeight, clampCardSpan, clearMemoCardSize, getMemoCardSize, MIN_CARD_SPAN, setMemoCardSize } from "../memoCardSize";

/** Arrow-key nudge, matching the 16px rhythm the card's own padding sits on. */
const KEYBOARD_STEP = 16;

/** Column metrics the grid publishes on each card's wrapper; absent in the single-column flow list. */
interface GridMetrics {
  columnWidth: number;
  gap: number;
  columnCount: number;
}

const readGridMetrics = (card: HTMLElement | null): GridMetrics | undefined => {
  const wrapper = card?.parentElement;
  if (!wrapper) return undefined;
  const columnWidth = Number(wrapper.dataset.gridColumnWidth);
  const gap = Number(wrapper.dataset.gridGap);
  const columnCount = Number(wrapper.dataset.gridColumns);
  if (!Number.isFinite(columnWidth) || columnWidth <= 0 || !Number.isFinite(columnCount) || columnCount < 1) {
    return undefined;
  }
  return { columnWidth, gap: Number.isFinite(gap) ? gap : 0, columnCount };
};

/** Pixel width of a card covering `span` columns, gaps between them included. */
const widthForSpan = (span: number, { columnWidth, gap }: GridMetrics): number => span * columnWidth + (span - 1) * gap;

/** The span whose packed width sits closest to `width` — how a sideways drag snaps to columns. */
const spanForWidth = (width: number, metrics: GridMetrics): number => {
  let best = MIN_CARD_SPAN;
  let bestDistance = Number.POSITIVE_INFINITY;
  const maxSpan = clampCardSpan(metrics.columnCount, metrics.columnCount);
  for (let span = MIN_CARD_SPAN; span <= maxSpan; span++) {
    const distance = Math.abs(widthForSpan(span, metrics) - width);
    if (distance < bestDistance) {
      best = span;
      bestDistance = distance;
    }
  }
  return best;
};

export interface UseMemoCardSizeReturn {
  /** The article ref the resize logic measures and writes against. */
  cardRef: React.RefObject<HTMLDivElement | null>;
  /** Committed card height, undefined when the card is still auto-sized. */
  cardHeight: number | undefined;
  /** Committed column span; 1 means the card keeps its natural single-column width. */
  cardSpan: number;
  /** True while the user is dragging the resize handle. */
  resizing: boolean;
  /** Attach to the bottom-right resize handle's pointerdown. */
  handleResizePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  /** Attach to the handle's pointermove; drags are captured so moves keep flowing. */
  handleResizePointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  /** Attach to the handle's pointerup/pointercancel; commits the final size. */
  handleResizePointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  /** Arrow-key resizing, so the handle works without a pointer. */
  handleResizeKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  /** Drop the custom size and fall back to the automatic layout. */
  resetCardSize: () => void;
}

export const useMemoCardSize = (memoName: string): UseMemoCardSizeReturn => {
  const [{ height: cardHeight, span: storedSpan }, setCommittedSize] = useState(() => getMemoCardSize(memoName));
  const cardSpan = storedSpan ?? MIN_CARD_SPAN;
  const [resizing, setResizing] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // `draggingRef` is what the handlers read, so none of them depends on a state
  // update having been flushed first.
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0, height: 0, width: 0 });
  const metricsRef = useRef<GridMetrics | undefined>(undefined);
  const pendingRef = useRef<{ height: number; span: number } | undefined>(undefined);
  const frameRef = useRef<number | null>(null);

  const stopPreview = useCallback(() => {
    if (frameRef.current == null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  // The drag bypasses React: the size is written straight to the card every frame, so the
  // corner tracks the cursor while the memo's markdown, attachments and reactions re-render
  // exactly once — on release. Rendering that tree per pointermove is what made the handle
  // feel unresponsive on long memos.
  const previewSize = useCallback((next: { height: number; span: number }) => {
    pendingRef.current = next;
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const card = cardRef.current;
      const pending = pendingRef.current;
      if (!card || !pending) return;
      card.style.height = `${pending.height}px`;
      const metrics = metricsRef.current;
      // Width is previewed on the card itself. The wrapper's width belongs to the grid and
      // only catches up on release, when the wall re-packs around the new span.
      if (metrics) card.style.width = `${widthForSpan(pending.span, metrics)}px`;
    });
  }, []);

  const commitSize = useCallback(
    (next: { height: number; span: number }) => {
      const height = clampCardHeight(next.height);
      const span = Math.max(MIN_CARD_SPAN, Math.round(next.span));
      const card = cardRef.current;
      if (card) {
        // Write the height before the state update so the committed frame is never a frame
        // behind the cursor, then let React own it. The previewed width is handed back to the
        // grid, which sizes the wrapper from the span we are about to store.
        card.style.height = `${height}px`;
        card.style.width = "";
      }
      setCommittedSize({ height, span: span > MIN_CARD_SPAN ? span : undefined });
      setMemoCardSize(memoName, { height, span });
    },
    [memoName],
  );

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
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
    const rect = card.getBoundingClientRect();
    metricsRef.current = readGridMetrics(card);
    originRef.current = { x: event.clientX, y: event.clientY, height: rect.height, width: rect.width };
    pendingRef.current = undefined;
    movedRef.current = false;
    draggingRef.current = true;
    setResizing(true);
  }, []);

  const handleResizePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!draggingRef.current) return;
      const origin = originRef.current;
      const travelY = event.clientY - origin.y;
      const travelX = event.clientX - origin.x;
      if (travelX === 0 && travelY === 0 && !movedRef.current) return;
      movedRef.current = true;
      const metrics = metricsRef.current;
      // Each axis drives the dimension it points at: the bottom edge follows the cursor
      // one-for-one, and the right edge snaps to whichever column boundary it is nearest.
      // In the single-column flow list there are no columns to snap to, so width is left
      // to the layout and only the height responds.
      previewSize({
        height: clampCardHeight(origin.height + travelY),
        span: metrics ? spanForWidth(origin.width + travelX, metrics) : MIN_CARD_SPAN,
      });
    },
    [previewSize],
  );

  const handleResizePointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!draggingRef.current) return;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      stopPreview();
      draggingRef.current = false;
      setResizing(false);
      // A click that never moved is not a resize; leave an auto-sized card auto-sized
      // instead of freezing it at whatever height it happened to have.
      if (movedRef.current && pendingRef.current) {
        commitSize(pendingRef.current);
      }
      movedRef.current = false;
      pendingRef.current = undefined;
    },
    [commitSize, stopPreview],
  );

  const resetCardSize = useCallback(() => {
    stopPreview();
    draggingRef.current = false;
    movedRef.current = false;
    pendingRef.current = undefined;
    // Drop what this hook wrote directly; React only clears styles it set itself.
    const card = cardRef.current;
    if (card) {
      card.style.height = "";
      card.style.width = "";
    }
    setResizing(false);
    setCommittedSize({});
    clearMemoCardSize(memoName);
  }, [memoName, stopPreview]);

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const card = cardRef.current;
      if (!card) return;
      if (event.key === "Escape") {
        event.preventDefault();
        resetCardSize();
        return;
      }
      const metrics = readGridMetrics(card);
      const spanStep = metrics ? (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0) : 0;
      const heightStep = event.key === "ArrowUp" ? -KEYBOARD_STEP : event.key === "ArrowDown" ? KEYBOARD_STEP : 0;
      if (spanStep === 0 && heightStep === 0) return;
      event.preventDefault();
      // Measure rather than read state: an auto-sized card has no stored height yet, and
      // nudging it should start from what the user can actually see.
      const height = (cardHeight ?? card.getBoundingClientRect().height) + heightStep;
      const span = metrics ? clampCardSpan(cardSpan + spanStep, metrics.columnCount) : MIN_CARD_SPAN;
      commitSize({ height, span });
    },
    [cardHeight, cardSpan, commitSize, resetCardSize],
  );

  // Hold the resize cursor for the whole gesture so it does not flicker into a text caret
  // whenever the pointer outruns the handle and crosses the memo body.
  useEffect(() => {
    if (!resizing) return;
    const { body } = document;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = "nwse-resize";
    body.style.userSelect = "none";
    return () => {
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
    };
  }, [resizing]);

  useEffect(() => () => stopPreview(), [stopPreview]);

  return {
    cardRef,
    cardHeight,
    cardSpan,
    resizing,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
    handleResizeKeyDown,
    resetCardSize,
  };
};
