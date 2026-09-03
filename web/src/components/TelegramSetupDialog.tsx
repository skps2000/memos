import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslate } from "@/utils/i18n";
import {
  discoverChatId,
  isValidBotToken,
  isValidChatId,
  loadTelegramConfig,
  saveTelegramConfig,
  type TelegramConfig,
} from "@/utils/telegram";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown above the form, e.g. why the previous send failed. */
  errorMessage?: string;
  /** Called after the config has been saved. */
  onSaved?: (config: TelegramConfig) => void;
}

/**
 * Asks once for a Telegram bot token and chat id, stores them in localStorage,
 * and explains how to obtain both.
 */
function TelegramSetupDialog({ open, onOpenChange, errorMessage, onSaved }: Props) {
  const t = useTranslate();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    if (!open) return;
    const existing = loadTelegramConfig();
    setBotToken(existing?.botToken ?? "");
    setChatId(existing?.chatId ?? "");
  }, [open]);

  const handleDiscoverChatId = async () => {
    if (!isValidBotToken(botToken)) {
      toast.error(t("telegram.invalid-token"));
      return;
    }
    setDiscovering(true);
    try {
      const found = await discoverChatId(botToken);
      if (found) {
        setChatId(found);
        toast.success(t("telegram.chat-id-found"));
      } else {
        toast.error(t("telegram.chat-id-not-found"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDiscovering(false);
    }
  };

  const handleSave = () => {
    if (!isValidBotToken(botToken)) {
      toast.error(t("telegram.invalid-token"));
      return;
    }
    if (!isValidChatId(chatId)) {
      toast.error(t("telegram.invalid-chat-id"));
      return;
    }
    const config = { botToken: botToken.trim(), chatId: chatId.trim() };
    saveTelegramConfig(config);
    toast.success(t("telegram.saved"));
    onOpenChange(false);
    onSaved?.(config);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("telegram.setup-title")}</DialogTitle>
          <DialogDescription>{t("telegram.setup-description")}</DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
        )}

        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="telegramBotToken">{t("telegram.bot-token")}</Label>
            <Input
              id="telegramBotToken"
              type="password"
              autoComplete="off"
              placeholder="123456789:AAH..."
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="telegramChatId">{t("telegram.chat-id")}</Label>
            <div className="flex gap-2">
              <Input
                id="telegramChatId"
                autoComplete="off"
                placeholder="123456789"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
              />
              <Button variant="outline" onClick={handleDiscoverChatId} disabled={discovering || !botToken}>
                {discovering ? t("telegram.finding") : t("telegram.find-chat-id")}
              </Button>
            </div>
          </div>

          <ol className="list-decimal space-y-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 pl-7 text-xs leading-5 text-muted-foreground">
            <li>{t("telegram.guide.step-1")}</li>
            <li>{t("telegram.guide.step-2")}</li>
            <li>{t("telegram.guide.step-3")}</li>
            <li>{t("telegram.guide.step-4")}</li>
          </ol>
          <a
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            href="https://core.telegram.org/bots/features#botfather"
            target="_blank"
            rel="noreferrer"
          >
            {t("telegram.guide.docs-link")}
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TelegramSetupDialog;
