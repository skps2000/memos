import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemoActionMenu from "@/components/MemoActionMenu";
import { State } from "@/types/proto/api/v1/common_pb";
import { MemoSchema, MemoShareSchema, Visibility } from "@/types/proto/api/v1/memo_service_pb";

const copyToClipboard = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const memoShares = vi.hoisted(() => ({ current: [] as unknown[] }));
const sharesEnabled = vi.hoisted(() => ({ current: [] as boolean[] }));

vi.mock("copy-to-clipboard", () => ({ default: copyToClipboard }));
vi.mock("react-hot-toast", () => ({ default: { success: toastSuccess, error: vi.fn() } }));
vi.mock("@/contexts/InstanceContext", () => ({ useInstance: () => ({ profile: { instanceUrl: "https://memos.example" } }) }));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => ({ name: "users/alice" }) }));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));
vi.mock("@/hooks/useMemoShareQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useMemoShareQueries")>()),
  useMemoShares: (_name: string, options?: { enabled?: boolean }) => {
    sharesEnabled.current.push(options?.enabled ?? true);
    return { data: memoShares.current };
  },
}));

/** Opens the menu and its copy submenu, returning the "copy link" item. */
async function openCopyMenu() {
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "common.copy" }));
  return screen.findByRole("menuitem", { name: "memo.copy-link" });
}

function renderMenu() {
  const memo = create(MemoSchema, {
    name: "memos/card",
    creator: "users/alice",
    state: State.NORMAL,
    visibility: Visibility.PRIVATE,
    content: "Card body",
  });

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <MemoActionMenu memo={memo} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MemoActionMenu copy link", () => {
  beforeEach(() => {
    copyToClipboard.mockReset();
    toastSuccess.mockReset();
    memoShares.current = [];
    sharesEnabled.current = [];
  });

  it("does not look up share links until the menu is opened", async () => {
    renderMenu();

    expect(sharesEnabled.current.every((enabled) => enabled === false)).toBe(true);

    await openCopyMenu();

    expect(sharesEnabled.current.at(-1)).toBe(true);
  });

  it("copies the share link when the memo has a live one", async () => {
    memoShares.current = [
      create(MemoShareSchema, {
        name: "memos/card/shares/tok3n",
        createTime: timestampFromDate(new Date("2026-09-01T00:00:00Z")),
      }),
    ];
    renderMenu();

    fireEvent.click(await openCopyMenu());

    expect(copyToClipboard).toHaveBeenCalledWith("https://memos.example/memos/shares/tok3n");
    expect(toastSuccess).toHaveBeenCalledWith("message.succeed-copy-share-link");
  });

  it("falls back to the memo URL when there is no share link", async () => {
    renderMenu();

    fireEvent.click(await openCopyMenu());

    expect(copyToClipboard).toHaveBeenCalledWith("https://memos.example/memos/card");
    expect(toastSuccess).toHaveBeenCalledWith("message.succeed-copy-link");
  });
});
