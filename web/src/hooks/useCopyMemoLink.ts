import copy from "copy-to-clipboard";
import { useCallback } from "react";
import toast from "react-hot-toast";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { getShareUrl, pickPreferredShare, useMemoShares } from "@/hooks/useMemoShareQueries";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { isSuperUser } from "@/utils/user";

interface Options {
  /**
   * The token the reader arrived on, when the memo was opened through a share
   * link. Copying then hands back that same link rather than the memo's own URL,
   * which the reader has no account to open.
   */
  shareToken?: string;

  /**
   * Whether to look up the memo's share links. Listing them costs a request and
   * is only permitted for the memo's owner, so callers that render one menu per
   * memo in a list should turn this on only while their menu is open.
   */
  enabled?: boolean;
}

/**
 * Copies the best link to a memo.
 *
 * A memo's own URL follows its visibility, so handing it to someone who cannot
 * already read the memo sends them to a sign-in page. When the memo has a live
 * share link, that link is the one worth copying: it opens without an account.
 */
export function useCopyMemoLink(memo: Memo, { enabled = true, shareToken }: Options = {}) {
  const t = useTranslate();
  const { profile } = useInstance();
  const currentUser = useCurrentUser();

  // Only the creator and admins may list a memo's shares; asking as anyone else
  // just earns a permission error.
  const canListShares = !shareToken && !memo.parent && (memo.creator === currentUser?.name || isSuperUser(currentUser));
  const { data: shares = [] } = useMemoShares(memo.name, { enabled: enabled && canListShares && !!memo.name });

  return useCallback(() => {
    const host = profile.instanceUrl || window.location.origin;
    if (shareToken) {
      copy(`${host}/memos/shares/${shareToken}`);
      toast.success(t("message.succeed-copy-share-link"));
      return;
    }

    const share = pickPreferredShare(shares);
    if (share) {
      copy(getShareUrl(share, host));
      toast.success(t("message.succeed-copy-share-link"));
      return;
    }
    copy(`${host}/${memo.name}`);
    toast.success(t("message.succeed-copy-link"));
  }, [memo.name, profile.instanceUrl, shareToken, shares, t]);
}
