import type { FC } from "react";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/utils/format";
import { useTranslate } from "@/utils/i18n";
import { uploadProgressRatio } from "../services/uploadService";
import { useEditorSelector } from "../state";

/**
 * Determinate gauge for the attachment uploads a save is waiting on. The bar
 * tracks the whole batch so it never runs backwards between files, while the
 * caption names the file currently in flight.
 */
export const UploadProgressBar: FC<{ className?: string }> = ({ className }) => {
  const t = useTranslate();
  const progress = useEditorSelector((s) => s.ui.uploadProgress);

  if (!progress) return null;

  const percent = Math.round(uploadProgressRatio(progress) * 100);
  const isProcessing = progress.phase === "processing";

  return (
    <div
      className={cn("w-full flex flex-col gap-1", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-live="polite"
      aria-label={t("editor.upload-progress.label")}
    >
      <div className="w-full flex flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex flex-row items-center gap-1.5 min-w-0">
          <span aria-hidden className="size-3 shrink-0 rounded-full border-[1.5px] border-current border-r-transparent animate-spin" />
          <span className="truncate">
            {isProcessing
              ? t("editor.upload-progress.processing", { filename: progress.filename })
              : t("editor.upload-progress.uploading", { filename: progress.filename })}
          </span>
        </span>
        <span className="shrink-0 tabular-nums">
          {progress.count > 1 && `${progress.index}/${progress.count} · `}
          {formatFileSize(progress.loaded)} / {formatFileSize(progress.total)} · {percent}%
        </span>
      </div>
      <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-primary transition-[width] duration-150 ease-out", isProcessing && "animate-pulse")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
