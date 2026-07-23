import { getVisibleText } from './ansi';
import {
    parseJsonlLine,
    readJsonlLinesSync
} from './jsonl-lines';

const KNOWN_THINKING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'ultracode', 'max'] as const;
const KNOWN_THINKING_EFFORTS_SET: ReadonlySet<string> = new Set(KNOWN_THINKING_EFFORTS);
export type TranscriptThinkingEffort = typeof KNOWN_THINKING_EFFORTS[number];

export interface ResolvedThinkingEffort {
    value: string;
    known: boolean;
}

const MODEL_STDOUT_PREFIX = '<local-command-stdout>Set model to ';
const MODEL_STDOUT_EFFORT_REGEX = /^<local-command-stdout>Set model to[\s\S]*? with ([a-zA-Z0-9-]+) effort<\/local-command-stdout>$/i;
const EFFORT_STDOUT_PREFIX = '<local-command-stdout>Set effort level to ';
const EFFORT_STDOUT_REGEX = /^<local-command-stdout>Set effort level to ([a-zA-Z0-9-]+)[\s\S]*<\/local-command-stdout>$/i;
const UNKNOWN_EFFORT_PATTERN = /^(?=.*[a-z0-9])[a-z0-9-]{2,20}$/;

interface TranscriptEntry {
    /** Base API reasoning effort recorded on an assistant turn (ground truth). */
    effort?: string;
    message?: { content?: string };
}

export function normalizeThinkingEffort(value: string | undefined): ResolvedThinkingEffort | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.toLowerCase();
    if (KNOWN_THINKING_EFFORTS_SET.has(normalized)) {
        return { value: normalized, known: true };
    }

    if (UNKNOWN_EFFORT_PATTERN.test(normalized)) {
        return { value: normalized, known: false };
    }

    return undefined;
}

export function getTranscriptThinkingEffort(transcriptPath: string | undefined): ResolvedThinkingEffort | undefined {
    if (!transcriptPath) {
        return undefined;
    }

    try {
        const lines = readJsonlLinesSync(transcriptPath);

        // Two competing signals in the transcript:
        //  - the label chosen via /effort or /model (what the user picked), and
        //  - the base effort recorded on each assistant turn (what actually ran).
        // A /effort pick is "this session only", so after a `claude -r` resume it
        // lingers in the transcript but no longer reflects reality. We therefore
        // trust the label only when it is newer than the last assistant turn (a
        // pending change not yet exercised); once a turn has run since, its
        // recorded base effort is ground truth. Scanning backward, the first hit
        // of each kind is the most recent one.
        let labelEffort: ResolvedThinkingEffort | undefined;
        let labelIdx = -1;
        let fieldEffort: ResolvedThinkingEffort | undefined;
        let fieldIdx = -1;

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (!line) {
                continue;
            }

            const entry = parseJsonlLine(line) as TranscriptEntry | null;
            if (!entry) {
                continue;
            }

            if (fieldIdx < 0 && typeof entry.effort === 'string') {
                fieldEffort = normalizeThinkingEffort(entry.effort);
                fieldIdx = i;
            }

            if (labelIdx < 0 && typeof entry.message?.content === 'string') {
                const visibleContent = getVisibleText(entry.message.content).trim();

                if (visibleContent.startsWith(EFFORT_STDOUT_PREFIX)) {
                    labelEffort = normalizeThinkingEffort(EFFORT_STDOUT_REGEX.exec(visibleContent)?.[1]);
                    labelIdx = i;
                } else if (visibleContent.startsWith(MODEL_STDOUT_PREFIX)) {
                    labelEffort = normalizeThinkingEffort(MODEL_STDOUT_EFFORT_REGEX.exec(visibleContent)?.[1]);
                    labelIdx = i;
                }
            }

            if (labelIdx >= 0 && fieldIdx >= 0) {
                break;
            }
        }

        if (labelEffort && labelIdx > fieldIdx) {
            return labelEffort;
        }
        if (fieldEffort) {
            return fieldEffort;
        }
        return labelEffort;
    } catch {
        return undefined;
    }
}
