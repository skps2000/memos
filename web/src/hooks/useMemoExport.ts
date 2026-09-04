import { useCallback, useState } from "react";
import { getAccessToken } from "@/auth-state";

/** The formats `/export/...` can hand back. */
export type MemoExportFormat = "zip" | "md" | "json";

const EXPORT_EXTENSION: Record<MemoExportFormat, string> = {
  zip: "zip",
  md: "md",
  json: "json",
};

/** Identifies what the caller is allowed to export: their own memo, or a share link. */
export type MemoExportTarget = { kind: "memo"; memoName: string } | { kind: "share"; shareToken: string };

/** Why an export could not be produced, so the caller can pick the right message. */
export type MemoExportErrorReason = "forbidden" | "not-found" | "failed";

export class MemoExportError extends Error {
  readonly reason: MemoExportErrorReason;

  constructor(reason: MemoExportErrorReason) {
    super(`memo export failed: ${reason}`);
    this.name = "MemoExportError";
    this.reason = reason;
  }
}

function buildExportUrl(target: MemoExportTarget, format: MemoExportFormat): string {
  const path =
    target.kind === "share"
      ? `/export/shares/${encodeURIComponent(target.shareToken)}`
      : `/export/memos/${encodeURIComponent(target.memoName.split("/").pop() ?? "")}`;
  return `${window.location.origin}${path}?format=${format}`;
}

function fallbackFileName(target: MemoExportTarget, format: MemoExportFormat): string {
  const stem = target.kind === "share" ? target.shareToken : (target.memoName.split("/").pop() ?? "export");
  return `memo-${stem}.${EXPORT_EXTENSION[format]}`;
}

/** Reads the server's suggested name out of Content-Disposition, if it sent one. */
function fileNameFromResponse(response: Response): string | undefined {
  const disposition = response.headers.get("content-disposition");
  if (!disposition) return undefined;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1];
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads a memo export.
 *
 * The request goes through `fetch` rather than a plain link so it can carry the
 * bearer token the rest of the app uses, and so a link whose owner turned
 * downloads off surfaces as a message instead of an error page in a new tab.
 */
export function useMemoExport() {
  const [pendingFormat, setPendingFormat] = useState<MemoExportFormat | undefined>();

  const exportMemo = useCallback(async (target: MemoExportTarget, format: MemoExportFormat) => {
    setPendingFormat(format);
    try {
      const headers: HeadersInit = {};
      // A share link needs no credentials; sending them anyway would only widen
      // what the request could reach.
      if (target.kind === "memo") {
        const token = getAccessToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      const response = await fetch(buildExportUrl(target, format), {
        headers,
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 403) throw new MemoExportError("forbidden");
        if (response.status === 404) throw new MemoExportError("not-found");
        throw new MemoExportError("failed");
      }

      saveBlob(await response.blob(), fileNameFromResponse(response) ?? fallbackFileName(target, format));
    } finally {
      setPendingFormat(undefined);
    }
  }, []);

  return { exportMemo, pendingFormat, isExporting: pendingFormat !== undefined };
}
