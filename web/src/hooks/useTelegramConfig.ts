import { useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateUserGeneralSetting } from "@/hooks/useUserQueries";
import { clearTelegramConfig, getTelegramConfigFromSetting, loadTelegramConfig, type TelegramConfig } from "@/utils/telegram";

const UPDATE_MASK = ["telegram_bot_token", "telegram_chat_id"];
// Module-level so the many memo cards on a page attempt the migration only once.
let migrationAttempted = false;

/**
 * Telegram bot token and chat id stored in the user's account setting, so they follow the
 * account to every browser. A value left in this browser's localStorage by the earlier
 * per-browser version is migrated to the account once, then removed.
 */
export function useTelegramConfig() {
  const { currentUser, userGeneralSetting, refetchSettings } = useAuth();
  const { mutateAsync: updateGeneralSetting, isPending: isSaving } = useUpdateUserGeneralSetting(currentUser?.name);

  const config = getTelegramConfigFromSetting(userGeneralSetting);

  const save = useCallback(
    async (next: TelegramConfig | null): Promise<void> => {
      await updateGeneralSetting({
        generalSetting: { telegramBotToken: next?.botToken.trim() ?? "", telegramChatId: next?.chatId.trim() ?? "" },
        updateMask: UPDATE_MASK,
      });
      await refetchSettings();
    },
    [updateGeneralSetting, refetchSettings],
  );

  useEffect(() => {
    if (migrationAttempted || !currentUser || !userGeneralSetting || config) return;
    const legacy = loadTelegramConfig();
    if (!legacy) return;
    migrationAttempted = true;
    save(legacy)
      .then(() => clearTelegramConfig())
      .catch((error) => console.warn("Failed to migrate Telegram config to account settings:", error));
  }, [currentUser, userGeneralSetting, config, save]);

  return { config, save, isSaving };
}
