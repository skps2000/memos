import { Code, ConnectError } from "@connectrpc/connect";
import { QueryClient } from "@tanstack/react-query";

// Codes the server has already decided on. Asking again cannot change the answer, and
// the wait costs the user: a memo detail page shows nothing at all until its query
// settles, so a retried NOT_FOUND doubles the blank time before the 404 page appears.
//
// Unauthenticated is here for a different reason: the auth interceptor in connect.ts
// already handles token refresh and request retry. If it still throws Unauthenticated,
// the session is truly gone and the caller is being redirected to /auth. A React Query
// retry would only fire a second failed refresh and a second redirect mid-navigation.
const TERMINAL_CODES = new Set<Code>([Code.Unauthenticated, Code.PermissionDenied, Code.NotFound]);

export const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (error instanceof ConnectError && TERMINAL_CODES.has(error.code)) return false;
  return failureCount < 1;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Balanced approach: Fresh enough for collaboration, but reduces unnecessary refetches
      // Individual queries can override with shorter staleTime if needed (e.g., notifications)
      staleTime: 1000 * 30, // 30 seconds (increased from 10s for better performance)
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
      retry: shouldRetry,
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchOnReconnect: true, // Refetch when network reconnects
    },
    mutations: {
      retry: shouldRetry,
    },
  },
});
