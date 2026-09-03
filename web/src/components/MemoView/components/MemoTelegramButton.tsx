import { CheckIcon, SendIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import TelegramSetupDialog from "@/components/TelegramSetupDialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslate } from "@/utils/i18n";
import { loadTelegramConfig, sendTelegramMessage, TelegramApiError, type TelegramConfig } from "@/utils/telegram";

const SENT_FEEDBACK_DURATION = 1500;

interface MemoTelegramButtonProps {
  content: string;
}

/**
 * Sends the raw memo content to the user's Telegram chat in one click.
 * The bot token and chat id are asked for once and then kept in localStorage.
 */
const MemoTelegramButton: React.FC<MemoTelegramButtonProps> = ({ content }) => {
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
      try {
        await sendTelegramMessage(config, content);
        toast.success(t("telegram.sent"));
        setSent(true);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setSent(false), SENT_FEEDBACK_DURATION);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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
    [content, t],
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
          {sent ? <CheckIcon className="text-primary" /> : <SendIcon className="text-muted-foreground" />}
        </TooltipTrigger>
        <TooltipContent>{t("telegram.send-to-telegram")}</TooltipContent>
      </Tooltip>
      <TelegramSetupDialog open={setupOpen} onOpenChange={setSetupOpen} errorMessage={setupError} onSaved={send} />
    </>
  );
};

export default MemoTelegramButton;
