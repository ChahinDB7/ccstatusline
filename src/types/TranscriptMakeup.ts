/**
 * Estimated breakdown of what fills the context window, derived from the
 * session transcript. Values are token estimates per category: character
 * counts scaled by a chars-to-tokens ratio calibrated against the last
 * assistant turn's recorded usage (or chars/4 when no usage exists yet).
 */
export interface TranscriptMakeup {
    /** Estimated tokens in the user's own messages (string prompts + text blocks). */
    userTokens: number;
    /** Estimated tokens in the assistant's visible text replies. */
    assistantTokens: number;
    /** Estimated tokens in thinking blocks (reasoning text only, not signatures). */
    thinkingTokens: number;
    /** Estimated tokens in tool calls + their outputs (tool_use inputs and tool_result content). */
    toolTokens: number;
    /** Estimated tokens in tool calls alone (tool_use inputs + names). */
    toolCallTokens: number;
    /** Estimated tokens in tool outputs alone (tool_result content). */
    toolOutputTokens: number;
    /** True when the ratio was calibrated from recorded usage; false for the chars/4 fallback. */
    measured: boolean;
}
