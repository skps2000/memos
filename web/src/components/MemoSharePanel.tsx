import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ConnectError } from "@connectrpc/connect";
import { CheckIcon, CopyIcon, DownloadIcon, LinkIcon, Loader2Icon, MessageCircleIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getShareUrl, useCreateMemoShare, useDeleteMemoShare, useMemoShares, useUpdateMemoShare } from "@/hooks/useMemoShareQueries";
import type { MemoShare } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

type ExpiryOption = "never" | "1d" | "7d" | "30d";

function getExpireDate(option: ExpiryOption): Date | undefined {
  if (option === "never") return undefined;
  const d = new Date();
  if (option === "1d") d.setDate(d.getDate() + 1);
  else if (option === "7d") d.setDate(d.getDate() + 7);
  else if (option === "30d") d.setDate(d.getDate() + 30);
  return d;
}

function formatExpiry(share: MemoShare, t: ReturnType<typeof useTranslate>): string {
  if (!share.expireTime) return t("memo.share.never-expires");
  const d = timestampDate(share.expireTime);
  return t("memo.share.expires-on", { date: d.toLocaleDateString() });
}

/** Summarises how the link has been used, which is what matters if it ever leaks. */
function formatViews(share: MemoShare, t: ReturnType<typeof useTranslate>): string {
  if (share.viewCount === 0) return t("memo.share.never-opened");
  if (!share.lastViewTime) return t("memo.share.view-count", { count: share.viewCount });
  return t("memo.share.view-count-with-last", {
    count: share.viewCount,
    date: timestampDate(share.lastViewTime).toLocaleString(),
  });
}

interface ShareLinkRowProps {
  share: MemoShare;
  memoName: string;
}

function ShareLinkRow({ share, memoName }: ShareLinkRowProps) {
  const t = useTranslate();
  const [copied, setCopied] = useState(false);
  const deleteShare = useDeleteMemoShare();
  const updateShare = useUpdateMemoShare();
  const url = getShareUrl(share);

  const handleToggle = async (change: { allowDownload?: boolean; includeComments?: boolean }) => {
    try {
      await updateShare.mutateAsync({ name: share.name, memoName, ...change });
    } catch (e) {
      toast.error((e as ConnectError).message || t("memo.share.update-failed"));
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async () => {
    try {
      await deleteShare.mutateAsync({ name: share.name, memoName });
      toast.success(t("memo.share.revoked"));
    } catch (e) {
      toast.error((e as ConnectError).message || t("memo.share.revoke-failed"));
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs text-muted-foreground">{url}</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title={t("memo.share.copy")}>
            {copied ? <CheckIcon className="h-3.5 w-3.5 text-success" /> : <CopyIcon className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={handleRevoke}
            disabled={deleteShare.isPending}
            title={t("memo.share.revoke")}
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{formatExpiry(share, t)}</span>
        <span>{formatViews(share, t)}</span>
      </div>

      <div className="mt-1 flex flex-col gap-2 border-t border-border/60 pt-2">
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <DownloadIcon className="h-3.5 w-3.5" />
            {t("memo.share.allow-download")}
          </span>
          <Switch
            checked={share.allowDownload ?? false}
            disabled={updateShare.isPending}
            onCheckedChange={(checked) => handleToggle({ allowDownload: checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MessageCircleIcon className="h-3.5 w-3.5" />
            {t("memo.share.include-comments")}
          </span>
          <Switch
            checked={share.includeComments ?? false}
            disabled={updateShare.isPending}
            onCheckedChange={(checked) => handleToggle({ includeComments: checked })}
          />
        </label>
      </div>
    </div>
  );
}

interface MemoSharePanelProps {
  open: boolean;
  onClose: () => void;
  memoName: string;
}

const MemoSharePanel = ({ open, onClose, memoName }: MemoSharePanelProps) => {
  const t = useTranslate();
  const [expiry, setExpiry] = useState<ExpiryOption>("never");
  // Both options are on by default: a link is meant to stand in for the memo.
  const [allowDownload, setAllowDownload] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);
  const { data: shares = [], isLoading } = useMemoShares(memoName, { enabled: open });
  const createShare = useCreateMemoShare();

  const expiryOptions = useMemo(
    () => [
      { value: "never", label: t("memo.share.expiry-never") },
      { value: "1d", label: t("memo.share.expiry-1-day") },
      { value: "7d", label: t("memo.share.expiry-7-days") },
      { value: "30d", label: t("memo.share.expiry-30-days") },
    ],
    [t],
  );

  const handleCreate = async () => {
    try {
      await createShare.mutateAsync({ memoName, expireTime: getExpireDate(expiry), allowDownload, includeComments });
    } catch (e) {
      toast.error((e as ConnectError).message || t("memo.share.create-failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            {t("memo.share.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Active links */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">{t("memo.share.active-links")}</p>
            {isLoading ? (
              <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : shares.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("memo.share.no-links")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {shares.map((share) => (
                  <ShareLinkRow key={share.name} share={share} memoName={memoName} />
                ))}
              </div>
            )}
          </div>

          {/* Options applied to the next link */}
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="share-allow-download" className="flex flex-col gap-0.5 text-sm font-normal">
                <span className="font-medium">{t("memo.share.allow-download")}</span>
                <span className="text-xs text-muted-foreground">{t("memo.share.allow-download-description")}</span>
              </Label>
              <Switch id="share-allow-download" checked={allowDownload} onCheckedChange={setAllowDownload} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="share-include-comments" className="flex flex-col gap-0.5 text-sm font-normal">
                <span className="font-medium">{t("memo.share.include-comments")}</span>
                <span className="text-xs text-muted-foreground">{t("memo.share.include-comments-description")}</span>
              </Label>
              <Switch id="share-include-comments" checked={includeComments} onCheckedChange={setIncludeComments} />
            </div>
          </div>

          {/* Create new link */}
          <div className="flex items-center gap-2">
            <Select value={expiry} items={expiryOptions} onValueChange={(v) => setExpiry(v as ExpiryOption)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {expiryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCreate} disabled={createShare.isPending} className="flex-1">
              {createShare.isPending ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  {t("memo.share.creating")}
                </>
              ) : (
                t("memo.share.create-link")
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MemoSharePanel;
