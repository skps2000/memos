const STORAGE_KEY = "memos-telegram-config";
const API_BASE = "https://api.telegram.org";
// Telegram rejects text messages longer than 4096 characters.
const MAX_MESSAGE_LENGTH = 4096;

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export class TelegramApiError extends Error {
  readonly errorCode: number;

  constructor(errorCode: number, description: string) {
    super(description);
    this.name = "TelegramApiError";
    this.errorCode = errorCode;
  }

  /** True when the failure is caused by a wrong token or chat id, so the stored config should be corrected. */
  get isConfigError(): boolean {
    return this.errorCode === 401 || this.errorCode === 404 || (this.errorCode === 400 && /chat not found/i.test(this.message));
  }
}

const BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{20,}$/;
const CHAT_ID_PATTERN = /^-?\d+$|^@[A-Za-z0-9_]{5,}$/;

export const isValidBotToken = (token: string): boolean => BOT_TOKEN_PATTERN.test(token.trim());
export const isValidChatId = (chatId: string): boolean => CHAT_ID_PATTERN.test(chatId.trim());

export const loadTelegramConfig = (): TelegramConfig | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TelegramConfig>;
    if (typeof parsed.botToken !== "string" || typeof parsed.chatId !== "string") return null;
    if (!parsed.botToken || !parsed.chatId) return null;
    return { botToken: parsed.botToken, chatId: parsed.chatId };
  } catch (error) {
    console.warn("Failed to load Telegram config from localStorage:", error);
    return null;
  }
};

export const saveTelegramConfig = (config: TelegramConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ botToken: config.botToken.trim(), chatId: config.chatId.trim() }));
  } catch (error) {
    console.warn("Failed to save Telegram config to localStorage:", error);
  }
};

export const clearTelegramConfig = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear Telegram config from localStorage:", error);
  }
};

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

const callTelegram = async <T>(botToken: string, method: string, body?: Record<string, unknown>): Promise<T> => {
  const response = await fetch(`${API_BASE}/bot${botToken.trim()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json().catch(() => null)) as TelegramResponse<T> | null;
  if (!data || !data.ok) {
    throw new TelegramApiError(data?.error_code ?? response.status, data?.description ?? response.statusText);
  }
  return data.result as T;
};

const splitMessage = (text: string): string[] => {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > MAX_MESSAGE_LENGTH) {
    // Prefer breaking on a newline so a chunk does not end mid-line.
    let cut = rest.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (cut < MAX_MESSAGE_LENGTH / 2) cut = MAX_MESSAGE_LENGTH;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) chunks.push(rest);
  return chunks;
};

/** Sends plain text to the configured chat. Long content is split into several messages. */
export const sendTelegramMessage = async (config: TelegramConfig, text: string): Promise<void> => {
  const content = text.trim() || "(empty memo)";
  for (const chunk of splitMessage(content)) {
    await callTelegram(config.botToken, "sendMessage", {
      chat_id: config.chatId.trim(),
      text: chunk,
      disable_web_page_preview: true,
    });
  }
};

interface TelegramUpdate {
  message?: { chat?: { id: number; type: string } };
  edited_message?: { chat?: { id: number; type: string } };
  channel_post?: { chat?: { id: number; type: string } };
}

/**
 * Looks up the chat id of the most recent conversation the bot received a message from.
 * Returns null when the bot has not been messaged yet.
 */
export const discoverChatId = async (botToken: string): Promise<string | null> => {
  const updates = await callTelegram<TelegramUpdate[]>(botToken, "getUpdates", { limit: 100 });
  for (let i = updates.length - 1; i >= 0; i--) {
    const update = updates[i];
    const chat = update.message?.chat ?? update.edited_message?.chat ?? update.channel_post?.chat;
    if (chat) return String(chat.id);
  }
  return null;
};
