import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemoSharePanel from "@/components/MemoSharePanel";
import { MemoShareSchema } from "@/types/proto/api/v1/memo_service_pb";

const updateShare = vi.hoisted(() => vi.fn());
const createShare = vi.hoisted(() => vi.fn());
const deleteShare = vi.hoisted(() => vi.fn());
const memoShares = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() }, default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
}));
vi.mock("@/hooks/useMemoShareQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useMemoShareQueries")>()),
  useMemoShares: () => ({ data: memoShares.current, isLoading: false }),
  useCreateMemoShare: () => ({ mutateAsync: createShare, isPending: false }),
  useDeleteMemoShare: () => ({ mutateAsync: deleteShare, isPending: false }),
  useUpdateMemoShare: () => ({ mutateAsync: updateShare, isPending: false }),
}));

function renderPanel() {
  render(<MemoSharePanel memoName="memos/detail" open onClose={() => {}} />);
}

describe("MemoSharePanel link options", () => {
  beforeEach(() => {
    updateShare.mockReset();
    updateShare.mockResolvedValue(undefined);
    memoShares.current = [
      create(MemoShareSchema, {
        name: "memos/detail/shares/tok3n",
        createTime: timestampFromDate(new Date("2026-09-01T00:00:00Z")),
        allowDownload: true,
        includeComments: true,
        viewCount: 4,
        lastViewTime: timestampFromDate(new Date("2026-09-05T00:00:00Z")),
      }),
    ];
  });

  it("shows how often the link has been opened", () => {
    renderPanel();
    expect(screen.getByText(/memo\.share\.view-count-with-last_other/)).toBeInTheDocument();
  });

  it("uses the singular form for a link opened once", () => {
    memoShares.current = [
      create(MemoShareSchema, {
        name: "memos/detail/shares/once",
        createTime: timestampFromDate(new Date("2026-09-01T00:00:00Z")),
        viewCount: 1,
        lastViewTime: timestampFromDate(new Date("2026-09-05T00:00:00Z")),
      }),
    ];
    renderPanel();
    expect(screen.getByText(/memo\.share\.view-count-with-last_one/)).toBeInTheDocument();
  });

  it("says so when a link has never been opened", () => {
    memoShares.current = [
      create(MemoShareSchema, {
        name: "memos/detail/shares/unused",
        createTime: timestampFromDate(new Date("2026-09-01T00:00:00Z")),
        viewCount: 0,
      }),
    ];
    renderPanel();
    expect(screen.getByText("memo.share.never-opened")).toBeInTheDocument();
  });

  it("turns downloads off on an existing link without touching the other option", () => {
    renderPanel();

    // Two switches per row plus the two that configure the next link.
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);

    expect(updateShare).toHaveBeenCalledWith({
      name: "memos/detail/shares/tok3n",
      memoName: "memos/detail",
      allowDownload: false,
    });
  });

  it("toggles comments on an existing link", () => {
    renderPanel();

    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]);

    expect(updateShare).toHaveBeenCalledWith({
      name: "memos/detail/shares/tok3n",
      memoName: "memos/detail",
      includeComments: false,
    });
  });
});
