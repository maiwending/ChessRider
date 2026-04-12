const DEFAULT_TEXT_AI_MODEL = (import.meta.env.VITE_TEXT_AI_MODEL || 'deepseek/deepseek-r1-0528-qwen3-8b').trim();

function getDefaultTextAiBaseUrl() {
  if (import.meta.env.VITE_TEXT_AI_BASE_URL) {
    return import.meta.env.VITE_TEXT_AI_BASE_URL;
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'knightaurachess.com' || host === 'www.knightaurachess.com') {
      return '/api/text-ai';
    }
  }

  return import.meta.env.VITE_TEXT_AI_PROXY_URL || 'http://10.253.0.1:1234/v1/chat/completions';
}

const DEFAULT_TEXT_AI_BASE_URL = getDefaultTextAiBaseUrl().trim();
const DEFAULT_TEXT_AI_SYSTEM_PROMPT =
  "You are an AI assistant. Always reply in the language the user uses. do not use enojis. Do not output 'Thinking', '...', or filler text.";

function sanitizeAiReply(text) {
  if (!text) return '';
  const withoutThinkBlocks = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '');
  const cleanedLines = withoutThinkBlocks
    .split('\n')
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return normalized && !['thinking', '...', '…'].includes(normalized);
    });
  const cleaned = cleanedLines.join('\n').trim();
  if (['thinking', '...', '…'].includes(cleaned.toLowerCase())) return '';
  return cleaned;
}

function extractReplyContent(data) {
  if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
  if (data?.message?.content) return data.message.content;
  if (Array.isArray(data?.messages) && data.messages.length > 0) {
    return data.messages[data.messages.length - 1]?.content || '';
  }
  return '';
}

function getBotChatStorageKey(chatId) {
  return `cr_bot_dm_${chatId}`;
}

export function isBotUid(uid) {
  return typeof uid === 'string' && uid.startsWith('bot_');
}

export function loadBotChatMessages(chatId) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getBotChatStorageKey(chatId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBotChatMessages(chatId, messages) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getBotChatStorageKey(chatId), JSON.stringify(messages));
  } catch {
    // Ignore local persistence failures.
  }
}

export async function requestTextAiReply({
  history,
  model = DEFAULT_TEXT_AI_MODEL,
  baseUrl = DEFAULT_TEXT_AI_BASE_URL,
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: DEFAULT_TEXT_AI_SYSTEM_PROMPT },
        ...history,
      ],
      max_tokens: 20480,
      temperature: 0.2,
      stream: false,
    }),
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || `Text AI request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const content = sanitizeAiReply(extractReplyContent(data));
  if (!content) {
    throw new Error('Text AI returned an empty reply.');
  }

  return content;
}

export {
  DEFAULT_TEXT_AI_BASE_URL,
  DEFAULT_TEXT_AI_MODEL,
};
