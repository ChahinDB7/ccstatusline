import type { RenderContext } from '../../types/RenderContext';
import type { TranscriptMakeup } from '../../types/TranscriptMakeup';
import type { WidgetItem } from '../../types/Widget';
import { formatTokens } from '../../utils/token-format';

import { formatRawOrLabeledValue } from './raw-or-labeled';

export type MakeupCategory = 'tools' | 'tool-calls' | 'tool-outputs' | 'assistant' | 'user';

interface MakeupWidgetConfig {
    label: string;
    displayName: string;
    description: string;
    previewValue: string;
    tokens: (makeup: TranscriptMakeup) => number;
}

const ESTIMATE_NOTE = 'Estimated from the transcript text, calibrated against the last recorded context usage (chars/4 before the first turn).';

const MAKEUP_WIDGET_CONFIGS: Record<MakeupCategory, MakeupWidgetConfig> = {
    'tools': {
        label: 'Tools: ',
        displayName: 'Tokens Tools',
        description: `Shows estimated context tokens held by tool calls + their outputs (file dumps, command output).\n${ESTIMATE_NOTE}`,
        previewValue: '~782.0k',
        tokens: makeup => makeup.toolTokens
    },
    'tool-calls': {
        label: 'T. Calls: ',
        displayName: 'Tokens Tool Calls',
        description: `Shows estimated context tokens held by tool calls alone (tool inputs, without their outputs).\n${ESTIMATE_NOTE}`,
        previewValue: '~76.0k',
        tokens: makeup => makeup.toolCallTokens
    },
    'tool-outputs': {
        label: 'T. Outputs: ',
        displayName: 'Tokens Tool Outputs',
        description: `Shows estimated context tokens held by tool outputs alone (file dumps, command output).\n${ESTIMATE_NOTE}`,
        previewValue: '~706.0k',
        tokens: makeup => makeup.toolOutputTokens
    },
    'assistant': {
        label: 'Asst: ',
        displayName: 'Tokens Assistant',
        description: `Shows estimated context tokens held by the assistant's visible text replies.\n${ESTIMATE_NOTE}`,
        previewValue: '~20.4k',
        tokens: makeup => makeup.assistantTokens
    },
    'user': {
        label: 'User: ',
        displayName: 'Tokens User',
        description: `Shows estimated context tokens held by your own messages.\n${ESTIMATE_NOTE}`,
        previewValue: '~12.1k',
        tokens: makeup => makeup.userTokens
    }
};

export function getMakeupWidgetDisplayName(category: MakeupCategory): string {
    return MAKEUP_WIDGET_CONFIGS[category].displayName;
}

export function getMakeupWidgetDescription(category: MakeupCategory): string {
    return MAKEUP_WIDGET_CONFIGS[category].description;
}

export function renderMakeupWidgetValue(category: MakeupCategory, item: WidgetItem, context: RenderContext): string | null {
    const config = MAKEUP_WIDGET_CONFIGS[category];

    if (context.isPreview) {
        return formatRawOrLabeledValue(item, config.label, config.previewValue);
    }

    const makeup = context.transcriptMakeup;
    if (!makeup) {
        return null;
    }

    return formatRawOrLabeledValue(item, config.label, `~${formatTokens(config.tokens(makeup))}`);
}
