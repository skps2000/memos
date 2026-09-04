import { Code, ConnectError } from "@connectrpc/connect";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("react-hot-toast", () => ({
  toast: { error: toastError },
}));

import useMemoDetailError from "@/hooks/useMemoDetailError";

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
};

const MemoDetailProbe = ({ error }: { error: Error | null }) => {
  useMemoDetailError({ error });
  return <div data-testid="memo-detail">memo</div>;
};

const renderAt = (path: string, error: Error | null) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/memos/:uid" element={<MemoDetailProbe error={error} />} />
        <Route path="/auth" element={<div data-testid="sign-in">sign in</div>} />
        <Route path="/404" element={<div data-testid="not-found">not found</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("useMemoDetailError", () => {
  it("sends an unauthenticated reader to sign in and back to the memo", () => {
    renderAt("/memos/abc123", new ConnectError("user not authenticated", Code.Unauthenticated));

    expect(screen.getByTestId("sign-in")).toBeTruthy();
    // The permalink survives the detour, so signing in lands on the memo the visitor asked for.
    expect(screen.getByTestId("location").textContent).toBe("/auth?redirect=%2Fmemos%2Fabc123&reason=protected-memo");
  });

  it("keeps the redirect target intact across query and hash", () => {
    renderAt("/memos/abc123?from=explore#comment-1", new ConnectError("user not authenticated", Code.Unauthenticated));

    expect(screen.getByTestId("location").textContent).toBe(
      "/auth?redirect=%2Fmemos%2Fabc123%3Ffrom%3Dexplore%23comment-1&reason=protected-memo",
    );
  });

  it.each([
    ["not found", Code.NotFound],
    ["permission denied", Code.PermissionDenied],
  ])("keeps %s on the 404 page, where signing in would not help", (_label, code) => {
    renderAt("/memos/abc123", new ConnectError("nope", code));

    expect(screen.getByTestId("not-found")).toBeTruthy();
  });

  it("leaves the page in place and reports other errors", () => {
    toastError.mockClear();
    renderAt("/memos/abc123", new ConnectError("backend exploded", Code.Internal));

    expect(screen.getByTestId("memo-detail")).toBeTruthy();
    expect(toastError).toHaveBeenCalledWith("[internal] backend exploded");
  });

  it("does nothing without an error", () => {
    toastError.mockClear();
    renderAt("/memos/abc123", null);

    expect(screen.getByTestId("memo-detail")).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
  });
});
