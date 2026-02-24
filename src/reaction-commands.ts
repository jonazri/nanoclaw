// Voice command integration for reactions
// Allows natural language reaction commands like:
// "React thumbs up to that last message"
// "Mark that message with a bookmark"
// "Remove my reaction"

import { Channel } from './types.js';
import { logger } from './logger.js';

interface ReactionCommand {
  pattern: RegExp;
  emoji: string;
  description: string;
}

// Reaction commands — patterns are matched ONLY after isReactionCommand() confirms
// the message is a reaction request, so these don't need to be overly cautious,
// but we still avoid single common words that appear in normal speech.
const REACTION_COMMANDS: ReactionCommand[] = [
  // Thumbs up/down
  { pattern: /thumbs?\s*up|👍/i, emoji: '👍', description: 'Thumbs up' },
  { pattern: /thumbs?\s*down|👎/i, emoji: '👎', description: 'Thumbs down' },

  // Love/heart
  { pattern: /\b(?:love|heart)\b|❤️|❤/i, emoji: '❤️', description: 'Heart/love' },

  // Task/productivity
  { pattern: /\b(?:check\s*mark)\b|✅/i, emoji: '✅', description: 'Check mark' },
  { pattern: /\b(?:pin|bookmark)\b|📌|🔖/i, emoji: '📌', description: 'Pin/bookmark' },
  { pattern: /\b(?:calendar)\b|📅/i, emoji: '📅', description: 'Calendar/schedule' },
  { pattern: /\b(?:star|important)\b|⭐/i, emoji: '⭐', description: 'Important/star' },

  // Questions
  { pattern: /\b(?:question\s*mark)\b|❓/i, emoji: '❓', description: 'Question mark' },
  { pattern: /\b(?:thinking\s*face)\b|💭/i, emoji: '💭', description: 'Thinking face' },

  // Emotions
  { pattern: /\b(?:fire)\b|🔥/i, emoji: '🔥', description: 'Fire' },
  { pattern: /\b(?:celebrate|party|congrats)\b|🎉/i, emoji: '🎉', description: 'Celebration' },
  { pattern: /\b(?:pray|prayer|tefilla)\b|🙏/i, emoji: '🙏', description: 'Prayer' },
  { pattern: /\b(?:laugh|lol)\b|😂/i, emoji: '😂', description: 'Laughing' },

  // Jewish-specific
  { pattern: /\b(?:menorah|shabbat\s*shalom)\b|🕎/i, emoji: '🕎', description: 'Menorah' },
  { pattern: /\b(?:torah|sefer)\b|📜/i, emoji: '📜', description: 'Scroll/Torah' },
  { pattern: /\b(?:mitz(?:vah|va))\b|✨/i, emoji: '✨', description: 'Mitzvah/sparkles' },
];

/**
 * Parse a message for reaction commands
 * Returns the emoji to react with, or null if no command found
 */
export function parseReactionCommand(message: string): string | null {
  const normalized = message.toLowerCase().trim();

  // Check for explicit reaction patterns
  for (const cmd of REACTION_COMMANDS) {
    if (cmd.pattern.test(normalized)) {
      return cmd.emoji;
    }
  }

  // Check for direct emoji in message (covers emoticons, symbols, and supplemental blocks)
  const emojiMatch = message.match(/[\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{1F300}-\u{1FAFF}]/u);
  if (emojiMatch) {
    return emojiMatch[0];
  }

  return null;
}

/**
 * Check if a message is a reaction command
 * Examples:
 * - "react thumbs up"
 * - "mark that with a bookmark"
 * - "add a heart to that message"
 */
export function isReactionCommand(message: string): boolean {
  const normalized = message.toLowerCase().trim();

  // Reaction trigger phrases — must clearly indicate a reaction intent
  const triggers = [
    /^react\s+/i,
    /^add\s+(?:a\s+)?reaction/i,
    /^mark\s+(?:that|this|the\s+last)\s+(?:with|as)\s+/i,
    /^send\s+(?:a\s+)?reaction/i,
  ];

  return triggers.some(pattern => pattern.test(normalized));
}

/**
 * Process a reaction command and send the appropriate reaction
 */
export async function handleReactionCommand(
  message: string,
  chatJid: string,
  channel: Channel
): Promise<boolean> {
  if (!isReactionCommand(message)) {
    return false;
  }

  const emoji = parseReactionCommand(message);
  if (!emoji) {
    logger.debug({ message }, 'Could not parse emoji from reaction command');
    return false;
  }

  if (!channel.reactToLatestMessage) {
    logger.warn('Channel does not support reactions');
    return false;
  }

  try {
    await channel.reactToLatestMessage(chatJid, emoji);
    logger.info({ chatJid, emoji }, 'Reaction command executed');
    return true;
  } catch (err) {
    logger.error({ err, chatJid, emoji }, 'Failed to execute reaction command');
    return false;
  }
}

/**
 * Get a description of all available reaction commands
 */
export function getReactionCommandsHelp(): string {
  const examples = REACTION_COMMANDS
    .map(cmd => `- "${cmd.description}" -> ${cmd.emoji}`)
    .join('\n');

  return `*Available Reaction Commands:*

You can say things like:
- "React thumbs up to that"
- "Mark that with a bookmark"
- "Add a heart to that message"

Supported reactions:
${examples}

You can also use the emoji directly in your command!`;
}
