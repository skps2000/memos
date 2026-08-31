import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMemoCardSize } from "@/components/MemoView/hooks/useMemoCardSize";
import { getMemoCardSize, MIN_RESIZABLE_CARD_HEIGHT, resetMemoCardSizesForTest } from "@/components/MemoView/memoCardSize";

// The handle's contract has three halves worth pinning down, because the bug this suite was
// written for was invisible to the old assertions: the drag *was* recorded and persisted, but
// the card never actually changed size, because the height was applied as a max-height and a
// max-height can only ever shrink a card. So these tests assert the rendered size, not just
// the stored number. Like the sidebar handle, the drag deliberately bypasses React and writes
// the node directly, committing to state exactly once on release.

const MEMO_NAME = "memos/test";
const NATURAL_HEIGHT = 200;
const NATURAL_WIDTH = 300;

// jsdom lays nothing out, so the card reports a fixed natural box until the hook writes an
// explicit size — at which point the inline style is what we assert against.
const stubRect = (element: HTMLElement, height: number, width: number) => {
  element.getBoundingClientRect = () =>
    ({ height, width, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
};

const Harness = ({ grid }: { grid?: { columnWidth: number; gap: number; columns: number } }) => {
  const { cardRef, cardHeight, cardSpan, resizing, ...handlers } = useMemoCardSize(MEMO_NAME);

  return (
    <div
      data-testid="wrapper"
      data-grid-column-width={grid ? String(grid.columnWidth) : undefined}
      data-grid-gap={grid ? String(grid.gap) : undefined}
      data-grid-columns={grid ? String(grid.columns) : undefined}
    >
      <article
        data-testid="card"
        ref={(node) => {
          cardRef.current = node;
          if (node) stubRect(node, cardHeight ?? NATURAL_HEIGHT, NATURAL_WIDTH);
        }}
        style={cardHeight ? { height: cardHeight } : undefined}
      >
        <span data-testid="state">{`${cardHeight ?? "auto"}/${cardSpan}/${resizing}`}</span>
        <button
          type="button"
          aria-label="Resize memo card"
          onPointerDown={handlers.handleResizePointerDown}
          onPointerMove={handlers.handleResizePointerMove}
          onPointerUp={handlers.handleResizePointerUp}
          onKeyDown={handlers.handleResizeKeyDown}
          onDoubleClick={handlers.resetCardSize}
        />
      </article>
    </div>
  );
};

const card = () => screen.getByTestId("card");
const handle = () => screen.getByRole("button", { name: "Resize memo card" });
const state = () => screen.getByTestId("state").textContent;

// Frames are queued rather than run inline: the hook coalesces its DOM writes into one
// animation frame, and running the callback synchronously would defeat the very coalescing
// that keeps a drag off React's render path.
let frameQueue: FrameRequestCallback[] = [];

const flushFrames = () => {
  const queued = frameQueue;
  frameQueue = [];
  for (const callback of queued) callback(0);
};

const drag = ({ dx = 0, dy = 0 }: { dx?: number; dy?: number }) => {
  fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(handle(), { pointerId: 1, clientX: dx, clientY: dy });
  flushFrames();
  fireEvent.pointerUp(handle(), { pointerId: 1, clientX: dx, clientY: dy });
};

beforeEach(() => {
  resetMemoCardSizesForTest();
  frameQueue = [];
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frameQueue.push(callback);
    return frameQueue.length;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
});

describe("memo card resize handle", () => {
  it("grows a card past its natural height — the regression that made the handle look dead", () => {
    render(<Harness />);
    expect(card().style.height).toBe("");

    drag({ dy: 150 });

    expect(card().style.height).toBe(`${NATURAL_HEIGHT + 150}px`);
    expect(getMemoCardSize(MEMO_NAME).height).toBe(NATURAL_HEIGHT + 150);
  });

  it("shrinks a card and refuses to go below the minimum", () => {
    render(<Harness />);

    drag({ dy: -(NATURAL_HEIGHT + 500) });

    expect(card().style.height).toBe(`${MIN_RESIZABLE_CARD_HEIGHT}px`);
    expect(getMemoCardSize(MEMO_NAME).height).toBe(MIN_RESIZABLE_CARD_HEIGHT);
  });

  it("tracks the pointer one-for-one and ignores sideways travel outside the grid", () => {
    render(<Harness />);

    // A diagonal drag used to fold both axes into the height, so the bottom edge ran at
    // double speed and a purely sideways drag resized the card at all.
    drag({ dx: 120, dy: 60 });

    expect(card().style.height).toBe(`${NATURAL_HEIGHT + 60}px`);
    expect(getMemoCardSize(MEMO_NAME).span).toBeUndefined();
  });

  it("keeps the drag off React until release", () => {
    render(<Harness />);

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 0, clientY: 90 });
    flushFrames();

    // The node already has the dragged height, but React still holds the pre-drag state.
    expect(card().style.height).toBe(`${NATURAL_HEIGHT + 90}px`);
    expect(state()).toBe("auto/1/true");

    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 0, clientY: 90 });
    expect(state()).toBe(`${NATURAL_HEIGHT + 90}/1/false`);
  });

  it("leaves an auto-sized card alone when the handle is only clicked", () => {
    render(<Harness />);

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientX: 0, clientY: 0 });

    expect(card().style.height).toBe("");
    expect(getMemoCardSize(MEMO_NAME)).toEqual({});
  });

  it("snaps a sideways drag to whole columns inside the grid", () => {
    // Columns are 300px with a 12px gap, so two columns measure 612px. Dragging 250px right
    // from a 300px card lands at 550px — nearer 612 than 300, so it snaps to two columns.
    render(<Harness grid={{ columnWidth: 300, gap: 12, columns: 4 }} />);

    drag({ dx: 250 });

    expect(getMemoCardSize(MEMO_NAME).span).toBe(2);
    // The width preview is handed back to the grid on release; the grid owns the wrapper.
    expect(card().style.width).toBe("");
  });

  it("never snaps wider than the wall has columns", () => {
    render(<Harness grid={{ columnWidth: 300, gap: 12, columns: 2 }} />);

    drag({ dx: 5000 });

    expect(getMemoCardSize(MEMO_NAME).span).toBe(2);
  });

  it("resizes both axes in one diagonal drag", () => {
    render(<Harness grid={{ columnWidth: 300, gap: 12, columns: 4 }} />);

    drag({ dx: 250, dy: 80 });

    expect(getMemoCardSize(MEMO_NAME)).toEqual({ height: NATURAL_HEIGHT + 80, span: 2 });
  });

  it("nudges with the arrow keys and resets on double-click", () => {
    render(<Harness grid={{ columnWidth: 300, gap: 12, columns: 4 }} />);

    fireEvent.keyDown(handle(), { key: "ArrowDown" });
    expect(getMemoCardSize(MEMO_NAME).height).toBe(NATURAL_HEIGHT + 16);

    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(getMemoCardSize(MEMO_NAME).span).toBe(2);

    fireEvent.doubleClick(handle());
    expect(getMemoCardSize(MEMO_NAME)).toEqual({});
    expect(card().style.height).toBe("");
  });

  it("restores a size stored by an earlier session", () => {
    resetMemoCardSizesForTest();
    localStorage.setItem("memos-memo-card-size", JSON.stringify({ [MEMO_NAME]: { height: 420, span: 3 } }));

    render(<Harness grid={{ columnWidth: 300, gap: 12, columns: 4 }} />);

    expect(state()).toBe("420/3/false");
    expect(card().style.height).toBe("420px");
  });

  it("migrates heights saved under the pre-span storage key", () => {
    resetMemoCardSizesForTest();
    localStorage.setItem("memos-memo-card-height", JSON.stringify({ [MEMO_NAME]: 360 }));

    render(<Harness />);

    expect(state()).toBe("360/1/false");
  });
});
