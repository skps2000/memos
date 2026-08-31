import { describe, expect, it } from "vitest";
import { assignColumnsByEstimatedHeight } from "@/components/ColumnGrid";

// The planner answers two questions per card: which column it starts in, and how many it
// covers. Spans are what a sideways card resize produces, so the packing has to keep them
// from overlapping their neighbours no matter how the heights fall.
const columnsOf = (placements: Map<string, { column: number; span: number }>) =>
  Object.fromEntries([...placements].map(([key, placement]) => [key, placement.column]));

describe("assignColumnsByEstimatedHeight", () => {
  it("assigns each card to the shortest estimated column with deterministic ties", () => {
    const placements = assignColumnsByEstimatedHeight({
      keys: ["a", "b", "c", "d"],
      columnCount: 2,
      getEstimatedHeight: (key) => ({ a: 100, b: 80, c: 70, d: 60 })[key] ?? 0,
    });

    expect(columnsOf(placements)).toEqual({
      a: 0,
      b: 1,
      c: 1,
      d: 0,
    });
  });

  it("keeps pinned cards in the first column while balancing later cards", () => {
    const placements = assignColumnsByEstimatedHeight({
      keys: ["leading", "a", "priority", "b", "c"],
      columnCount: 3,
      getEstimatedHeight: (key) => ({ leading: 160, a: 90, priority: 80, b: 120, c: 70 })[key] ?? 0,
      pinnedKeys: new Set(["leading", "priority"]),
    });

    expect(columnsOf(placements)).toEqual({
      leading: 0,
      a: 1,
      priority: 0,
      b: 2,
      c: 1,
    });
  });

  it("defaults every card to a single column when no spans are supplied", () => {
    const placements = assignColumnsByEstimatedHeight({
      keys: ["a", "b"],
      columnCount: 3,
      getEstimatedHeight: () => 100,
    });

    expect([...placements.values()].map((placement) => placement.span)).toEqual([1, 1]);
  });

  it("starts a wide card where the columns it covers are lowest", () => {
    // Column 0 is already tall, so the two-column card cannot start there without waiting
    // behind it: columns 1-2 are empty and take it immediately.
    const placements = assignColumnsByEstimatedHeight({
      keys: ["tall", "wide"],
      columnCount: 3,
      getEstimatedHeight: (key) => (key === "tall" ? 400 : 100),
      getSpan: (key) => (key === "wide" ? 2 : 1),
    });

    expect(placements.get("tall")).toEqual({ column: 0, span: 1 });
    expect(placements.get("wide")).toEqual({ column: 1, span: 2 });
  });

  it("drops every column a wide card covers to the same baseline so nothing packs beside it", () => {
    // "wide" spans both columns, so "after" cannot slip into the notch left by the shorter
    // column — it has to start below the wide card.
    const placements = assignColumnsByEstimatedHeight({
      keys: ["short", "wide", "after"],
      columnCount: 2,
      getEstimatedHeight: (key) => ({ short: 50, wide: 100, after: 40 })[key] ?? 0,
      getSpan: (key) => (key === "wide" ? 2 : 1),
    });

    expect(placements.get("wide")).toEqual({ column: 0, span: 2 });
    // Both columns now sit at 150 (the wide card's baseline of 50 plus its 100), so the tie
    // resolves left rather than back into column 1's old 0 offset.
    expect(placements.get("after")).toEqual({ column: 0, span: 1 });
  });

  it("clamps a span stored wider than the wall currently is", () => {
    const placements = assignColumnsByEstimatedHeight({
      keys: ["wide"],
      columnCount: 2,
      getEstimatedHeight: () => 100,
      getSpan: () => 5,
    });

    expect(placements.get("wide")).toEqual({ column: 0, span: 2 });
  });

  it("keeps a pinned card in column one even when it is wide", () => {
    const placements = assignColumnsByEstimatedHeight({
      keys: ["a", "priority"],
      columnCount: 3,
      getEstimatedHeight: () => 100,
      getSpan: (key) => (key === "priority" ? 2 : 1),
      pinnedKeys: new Set(["priority"]),
    });

    expect(placements.get("priority")).toEqual({ column: 0, span: 2 });
  });
});
