import { BookmarkIcon, CodeIcon, LinkIcon, type LucideIcon, SquareCheckIcon } from "lucide-react";
import { ROUTES } from "@/router/routes";
import type { Translations } from "@/utils/i18n";

export type MemoScope = "home" | "explore" | "archived";

export const BUILTIN_TASKS_VIEW_ID = "__built_in_tasks__";
export const BUILTIN_TASKS_VIEW_FILTER = "has_task_list && has_incomplete_tasks";

export interface BuiltinMemoView {
  id: string;
  /** Translation key for the sidebar label. */
  labelKey: Translations;
  icon: LucideIcon;
  /** CEL filter appended to the memo query while the view is selected. */
  filter: string;
}

/**
 * Views every account has without creating them. They live in the sidebar above the user's
 * saved views and combine with tag, date and search filters like any other view.
 */
export const BUILTIN_MEMO_VIEWS: readonly BuiltinMemoView[] = [
  { id: BUILTIN_TASKS_VIEW_ID, labelKey: "common.tasks", icon: SquareCheckIcon, filter: BUILTIN_TASKS_VIEW_FILTER },
  { id: "__built_in_pinned__", labelKey: "common.pinned", icon: BookmarkIcon, filter: "pinned" },
  { id: "__built_in_links__", labelKey: "memo.filters.has-link", icon: LinkIcon, filter: "has_link" },
  { id: "__built_in_code__", labelKey: "memo.filters.has-code", icon: CodeIcon, filter: "has_code" },
];

export const getBuiltinMemoView = (id: string | undefined): BuiltinMemoView | undefined =>
  id ? BUILTIN_MEMO_VIEWS.find((view) => view.id === id) : undefined;

export const getMemoViewId = (name: string): string => {
  const parts = name.split("/");
  return parts.length === 4 ? parts[3] : name;
};

export const isMemoScopeRoute = (pathname: string): boolean =>
  pathname === ROUTES.HOME || pathname === ROUTES.EXPLORE || pathname === ROUTES.ARCHIVED;

export const getMemoScopePath = (scope: MemoScope): string => {
  if (scope === "explore") return ROUTES.EXPLORE;
  if (scope === "archived") return ROUTES.ARCHIVED;
  return ROUTES.HOME;
};

const cleanPathname = (value: string): string => value.split(/[?#]/, 1)[0] || ROUTES.HOME;

interface ResolveMemoScopeOptions {
  currentUsername?: string;
  detailFrom?: string;
  memoArchived?: boolean;
  fallback?: MemoScope;
}

export const resolveMemoScope = (pathname: string, options: ResolveMemoScopeOptions = {}): MemoScope => {
  const cleanPath = cleanPathname(pathname);
  if (cleanPath === ROUTES.EXPLORE) return "explore";
  if (cleanPath === ROUTES.ARCHIVED) return "archived";
  if (cleanPath === ROUTES.HOME) return "home";

  const profileMatch = cleanPath.match(/^\/u\/([^/]+)$/);
  if (profileMatch) {
    return options.currentUsername && decodeURIComponent(profileMatch[1]) === options.currentUsername ? "home" : "explore";
  }

  if (cleanPath.startsWith("/memos/") && options.detailFrom) {
    return resolveMemoScope(options.detailFrom, {
      currentUsername: options.currentUsername,
      fallback: options.fallback,
    });
  }

  if (cleanPath.startsWith("/memos/") && options.memoArchived) {
    return "archived";
  }

  return options.fallback ?? "home";
};
