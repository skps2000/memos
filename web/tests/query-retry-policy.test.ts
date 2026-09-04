import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { shouldRetry } from "@/lib/query-client";

describe("shouldRetry", () => {
  it.each([
    ["unauthenticated", Code.Unauthenticated],
    ["permission denied", Code.PermissionDenied],
    ["not found", Code.NotFound],
  ])("does not retry %s — the server has already decided", (_label, code) => {
    expect(shouldRetry(0, new ConnectError("no", code))).toBe(false);
  });

  it("retries a transient failure once", () => {
    const error = new ConnectError("try again", Code.Unavailable);

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });

  it("retries a non-Connect error once", () => {
    expect(shouldRetry(0, new Error("network down"))).toBe(true);
    expect(shouldRetry(1, new Error("network down"))).toBe(false);
  });
});
