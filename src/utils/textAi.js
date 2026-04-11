const DEFAULT_TEXT_AI_MODEL = 'deepseek/deepseek-r1-0528-qwen3-8b';
const DEFAULT_TEXT_AI_BASE_URL = 'http://10.0.0.133:1234/v1/chat/completions';
const DEFAULT_TEXT_AI_SYSTEM_PROMPT =
  'You are an AI assistant. Always reply in the language the user uses. do not use enojis';

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
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: DEFAULT_TEXT_AI_SYSTEM_PROMPT },
        ...history,
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Text AI request failed with ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Text AI returned an empty reply.');
  }

  return content;
}

export {
  DEFAULT_TEXT_AI_BASE_URL,
  DEFAULT_TEXT_AI_MODEL,
};
