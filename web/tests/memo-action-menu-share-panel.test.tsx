import { create } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MemoActionMenu from "@/components/MemoActionMenu";
import { State } from "@/types/proto/api/v1/common_pb";
import { MemoSchema, Visibility } from "@/types/proto/api/v1/memo_service_pb";

vi.mock("copy-to-clipboard", () => ({ default: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/InstanceContext", () => ({ useInstance: () => ({ profile: { instanceUrl: "https://memos.example" } }) }));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => ({ name: "users/alice" }) }));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));
vi.mock("@/hooks/useMemoShareQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useMemoShareQueries")>()),
  useMemoShares: () => ({ data: [] }),
}));
vi.mock("@/components/MemoSharePanel", () => ({ default: () => <div data-testid="share-panel" /> }));

function renderMenu(overrides: Parameters<typeof create<typeof MemoSchema>>[1] = {}) {
  const memo = create(MemoSchema, {
    name: "memos/card",
    creator: "users/alice",
    state: State.NORMAL,
    visibility: Visibility.PRIVATE,
    content: "Card body",
    ...overrides,
  });

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <MemoActionMenu memo={memo} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const openMenu = () => fireEvent.click(screen.getByRole("button"));

describe("MemoActionMenu share links", () => {
  it("opens the share panel from the card menu", async () => {
    renderMenu();
    openMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "memo.share.open-panel" }));

    expect(screen.getByTestId("share-panel")).toBeInTheDocument();
  });

  it("hides the entry on a comment, which cannot be shared on its own", async () => {
    renderMenu({ parent: "memos/parent" });
    openMenu();

    await screen.findByRole("menuitem", { name: "common.copy" });
    expect(screen.queryByRole("menuitem", { name: "memo.share.open-panel" })).not.toBeInTheDocument();
  });

  it("hides the entry on an archived memo, which the server refuses to share", async () => {
    renderMenu({ state: State.ARCHIVED });
    openMenu();

    await screen.findByRole("menuitem", { name: "common.restore" });
    expect(screen.queryByRole("menuitem", { name: "memo.share.open-panel" })).not.toBeInTheDocument();
  });

  it("hides the entry on someone else's memo", async () => {
    renderMenu({ creator: "users/bob" });
    openMenu();

    await screen.findByRole("menuitem", { name: "common.copy" });
    expect(screen.queryByRole("menuitem", { name: "memo.share.open-panel" })).not.toBeInTheDocument();
  });
});
