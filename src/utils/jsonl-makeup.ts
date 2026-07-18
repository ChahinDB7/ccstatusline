import * as fs from 'fs';

import type { TranscriptMakeup } from '../types/TranscriptMakeup';

import {
    parseJsonlLine,
    readJsonlLines
} from './jsonl-lines';

interface MakeupUsage {
    input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
}

interface MakeupBlock {
    type?: string;
    text?: string;
    thinking?: string;
    name?: string;
    input?: unknown;
    content?: unknown;
}

interface MakeupEntry {
    type?: string;
    message?: {
        role?: string;
        content?: unknown;
        usage?: MakeupUsage;
    };
}

/**
 * Char length of a tool_result content: a plain string, or a list of blocks
 * where each block counts as its text (or its full JSON when there is none).
 */
function contentLength(content: unknown): number {
    if (typeof content === 'string') {
        return content.length;
    }
    if (Array.isArray(content)) {
        let total = 0;
        for (const block of content) {
            if (block && typeof block === 'object') {
                const text = (block as { text?: unknown }).text;
                total += typeof text === 'string' && text.length > 0
                    ? text.length
                    : JSON.stringify(block).length;
            } else {
                total += String(block).length;
            }
        }
        return total;
    }
    return 0;
}

/**
 * Walk the transcript once and estimate how many context tokens each category
 * (user text, assistant text, thinking, tool calls + outputs) occupies.
 *
 * Char counts are converted to tokens with a ratio calibrated against the last
 * assistant turn's recorded usage (input + both cache buckets = the prompt that
 * filled the window). When no usage is recorded yet, chars/4 is used instead.
 * Returns null when the transcript is missing or unreadable.
 */
export async function getTranscriptMakeup(transcriptPath: string): Promise<TranscriptMakeup | null> {
    try {
        if (!fs.existsSync(transcriptPath)) {
            return null;
        }

        const lines = await readJsonlLines(transcriptPath);

        let userChars = 0;
        let assistantChars = 0;
        let thinkingChars = 0;
        let toolCallChars = 0;
        let toolOutputChars = 0;
        let lastUsage: MakeupUsage | null = null;

        for (const line of lines) {
            const entry = parseJsonlLine(line) as MakeupEntry | null;
            const message = entry?.message;
            if (!message || typeof message !== 'object') {
                continue;
            }

            const role = message.role;
            const content = message.content;

            if (typeof content === 'string') {
                if (role === 'user') {
                    userChars += content.length;
                } else {
                    assistantChars += content.length;
                }
            } else if (Array.isArray(content)) {
                for (const raw of content) {
                    if (!raw || typeof raw !== 'object') {
                        continue;
                    }
                    const block = raw as MakeupBlock;
                    switch (block.type) {
                        case 'text': {
                            const length = typeof block.text === 'string' ? block.text.length : 0;
                            if (role === 'user') {
                                userChars += length;
                            } else {
                                assistantChars += length;
                            }
                            break;
                        }
                        case 'thinking':
                            // Only the reasoning text counts as context; the signature
                            // is metadata (file size, not window space).
                            thinkingChars += typeof block.thinking === 'string' ? block.thinking.length : 0;
                            break;
                        case 'tool_use':
                            toolCallChars += JSON.stringify(block.input ?? {}).length
                                + (typeof block.name === 'string' ? block.name.length : 0);
                            break;
                        case 'tool_result':
                            toolOutputChars += contentLength(block.content);
                            break;
                    }
                }
            }

            if (entry.type === 'assistant' && message.usage && typeof message.usage === 'object') {
                lastUsage = message.usage;
            }
        }

        const modelChars = userChars + assistantChars + thinkingChars + toolCallChars + toolOutputChars;
        const measuredTokens = lastUsage
            ? (lastUsage.input_tokens ?? 0)
            + (lastUsage.cache_read_input_tokens ?? 0)
            + (lastUsage.cache_creation_input_tokens ?? 0)
            : 0;

        const measured = measuredTokens > 0 && modelChars > 0;
        const ratio = measured ? measuredTokens / modelChars : 0.25;

        return {
            userTokens: Math.round(userChars * ratio),
            assistantTokens: Math.round(assistantChars * ratio),
            thinkingTokens: Math.round(thinkingChars * ratio),
            toolTokens: Math.round((toolCallChars + toolOutputChars) * ratio),
            toolCallTokens: Math.round(toolCallChars * ratio),
            toolOutputTokens: Math.round(toolOutputChars * ratio),
            measured
        };
    } catch {
        return null;
    }
}
