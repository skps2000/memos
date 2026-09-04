import { CheckIcon, Loader2Icon, SendIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import TelegramSetupDialog from "@/components/TelegramSetupDialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";
import { loadTelegramConfig, sendTelegramMemo, TelegramApiError, type TelegramConfig } from "@/utils/telegram";

const SENT_FEEDBACK_DURATION = 1500;
const RESULT_TOAST_DURATION = 6000;

interface MemoTelegramButtonProps {
  content: string;
  attachments: Attachment[];
}

/**
 * Sends the raw memo content and its attachments to the user's Telegram chat in one click.
 * The bot token and chat id are asked for once and then kept in localStorage.
 */
const MemoTelegramButton: React.FC<MemoTelegramButtonProps> = ({ content, attachments }) => {
  const t = useTranslate();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupError, setSetupError] = useState<string | undefined>();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const send = useCallback(
    async (config: TelegramConfig) => {
      setSending(true);
      const toastId = toast.loading(t("telegram.sending"));
      try {
        const result = await sendTelegramMemo(
          config,
          {
            content,
            attachments: attachments.map((a) => ({ filename: a.filename, type: a.type, size: a.size, url: getAttachmentUrl(a) })),
          },
          ({ current, total }) => {
            if (total > 1) toast.loading(t("telegram.sending-progress", { current, total }), { id: toastId });
          },
        );

        const sentCount = result.sentAttachments.length;
        const failed = result.failedAttachments;
        if (failed.length === 0) {
          const message = sentCount > 0 ? t("telegram.sent-with-attachments", { count: sentCount }) : t("telegram.sent");
          toast.success(message, { id: toastId });
        } else {
          const details = failed.map((f) => `${f.filename}: ${f.reason}`).join("\n");
          toast.error(`${t("telegram.sent-partially", { sent: sentCount, failed: failed.length })}\n${details}`, {
            id: toastId,
            duration: RESULT_TOAST_DURATION,
          });
        }
        setSent(true);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setSent(false), SENT_FEEDBACK_DURATION);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.dismiss(toastId);
        if (error instanceof TelegramApiError && error.isConfigError) {
          // Wrong token or chat id: let the user fix it right away.
          setSetupError(`${t("telegram.send-failed")}: ${message}`);
          setSetupOpen(true);
        } else {
          toast.error(`${t("telegram.send-failed")}: ${message}`);
        }
      } finally {
        setSending(false);
      }
    },
    [content, attachments, t],
  );

  const handleClick = useCallback(() => {
    const config = loadTelegramConfig();
    if (!config) {
      setSetupError(undefined);
      setSetupOpen(true);
      return;
    }
    void send(config);
  }, [send]);

  const icon = sending ? (
    <Loader2Icon className="animate-spin text-muted-foreground" />
  ) : sent ? (
    <CheckIcon className="text-primary" />
  ) : (
    <SendIcon className="text-muted-foreground" />
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-4"
              aria-label={t("telegram.send-to-telegram")}
              disabled={sending}
              onClick={handleClick}
            />
          }
        >
          {icon}
        </TooltipTrigger>
        <TooltipContent>
          {attachments.length > 0
            ? t("telegram.send-to-telegram-with-attachments", { count: attachments.length })
            : t("telegram.send-to-telegram")}
        </TooltipContent>
      </Tooltip>
      <TelegramSetupDialog open={setupOpen} onOpenChange={setSetupOpen} errorMessage={setupError} onSaved={send} />
    </>
  );
};

export default MemoTelegramButton;
