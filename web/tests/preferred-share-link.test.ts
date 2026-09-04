import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { getShareUrl, pickPreferredShare } from "@/hooks/useMemoShareQueries";
import { MemoShareSchema } from "@/types/proto/api/v1/memo_service_pb";

const NOW = new Date("2026-09-05T00:00:00Z");

function share(token: string, options: { expiresInDays?: number; createdDaysAgo?: number } = {}) {
  const created = new Date(NOW.getTime() - (options.createdDaysAgo ?? 0) * 86_400_000);
  const expires = options.expiresInDays === undefined ? undefined : new Date(NOW.getTime() + options.expiresInDays * 86_400_000);
  return create(MemoShareSchema, {
    name: `memos/abc/shares/${token}`,
    createTime: timestampFromDate(created),
    expireTime: expires ? timestampFromDate(expires) : undefined,
  });
}

describe("pickPreferredShare", () => {
  it("returns nothing when there are no links", () => {
    expect(pickPreferredShare([], NOW)).toBeUndefined();
  });

  it("skips links that have already expired", () => {
    const expired = create(MemoShareSchema, {
      name: "memos/abc/shares/dead",
      createTime: timestampFromDate(new Date(NOW.getTime() - 86_400_000)),
      expireTime: timestampFromDate(new Date(NOW.getTime() - 3_600_000)),
    });
    expect(pickPreferredShare([expired], NOW)).toBeUndefined();
  });

  it("prefers a link that never expires over one that does", () => {
    const picked = pickPreferredShare([share("temporary", { expiresInDays: 30 }), share("permanent")], NOW);
    expect(picked?.name).toContain("permanent");
  });

  it("prefers the longest-lived link among expiring ones", () => {
    const picked = pickPreferredShare([share("tomorrow", { expiresInDays: 1 }), share("next-month", { expiresInDays: 30 })], NOW);
    expect(picked?.name).toContain("next-month");
  });

  it("breaks ties on equal expiry with the newest link", () => {
    const picked = pickPreferredShare(
      [share("older", { expiresInDays: 7, createdDaysAgo: 5 }), share("newer", { expiresInDays: 7, createdDaysAgo: 1 })],
      NOW,
    );
    expect(picked?.name).toContain("newer");
  });
});

describe("getShareUrl", () => {
  it("builds the link against the instance URL when one is given", () => {
    expect(getShareUrl(share("tok3n"), "https://marklog.example.com")).toBe("https://marklog.example.com/memos/shares/tok3n");
  });

  it("falls back to the current origin", () => {
    expect(getShareUrl(share("tok3n"))).toBe(`${window.location.origin}/memos/shares/tok3n`);
  });
});
