import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    TranscriptMakeup,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { TokensAssistantWidget } from '../TokensAssistant';
import { TokensToolCallsWidget } from '../TokensToolCalls';
import { TokensToolOutputsWidget } from '../TokensToolOutputs';
import { TokensToolsWidget } from '../TokensTools';
import { TokensUserWidget } from '../TokensUser';

const MAKEUP: TranscriptMakeup = {
    userTokens: 12100,
    assistantTokens: 20400,
    thinkingTokens: 5000,
    toolTokens: 782000,
    toolCallTokens: 76000,
    toolOutputTokens: 706000,
    measured: true
};

function createItem(type: string, rawValue = false): WidgetItem {
    return { id: `${type}-1`, type, rawValue };
}

describe('transcript makeup token widgets', () => {
    const cases = [
        { widget: new TokensToolsWidget(), type: 'tokens-tools', label: 'Tools: ', value: '~782.0k', displayName: 'Tokens Tools' },
        { widget: new TokensToolCallsWidget(), type: 'tokens-tool-calls', label: 'T. Calls: ', value: '~76.0k', displayName: 'Tokens Tool Calls' },
        { widget: new TokensToolOutputsWidget(), type: 'tokens-tool-outputs', label: 'T. Outputs: ', value: '~706.0k', displayName: 'Tokens Tool Outputs' },
        { widget: new TokensAssistantWidget(), type: 'tokens-assistant', label: 'Asst: ', value: '~20.4k', displayName: 'Tokens Assistant' },
        { widget: new TokensUserWidget(), type: 'tokens-user', label: 'User: ', value: '~12.1k', displayName: 'Tokens User' }
    ] as const;

    for (const { widget, type, label, value, displayName } of cases) {
        describe(displayName, () => {
            it('has correct metadata', () => {
                expect(widget.getDisplayName()).toBe(displayName);
                expect(widget.getCategory()).toBe('Tokens');
                expect(widget.supportsRawValue()).toBe(true);
                expect(widget.supportsColors(createItem(type))).toBe(true);
            });

            it('renders a labelled preview', () => {
                const result = widget.render(createItem(type), { isPreview: true }, DEFAULT_SETTINGS);
                expect(result).toMatch(new RegExp(`^${label.trim()} ~[\\d.]+k$`));
            });

            it('renders the estimated tokens with label', () => {
                const context: RenderContext = { transcriptMakeup: MAKEUP };
                expect(widget.render(createItem(type), context, DEFAULT_SETTINGS)).toBe(`${label}${value}`);
            });

            it('renders the raw value without label', () => {
                const context: RenderContext = { transcriptMakeup: MAKEUP };
                expect(widget.render(createItem(type, true), context, DEFAULT_SETTINGS)).toBe(value);
            });

            it('returns null when no makeup data is available', () => {
                expect(widget.render(createItem(type), {}, DEFAULT_SETTINGS)).toBeNull();
                expect(widget.render(createItem(type), { transcriptMakeup: null }, DEFAULT_SETTINGS)).toBeNull();
            });
        });
    }

    it('formats small counts without a k suffix', () => {
        const widget = new TokensUserWidget();
        const context: RenderContext = { transcriptMakeup: { ...MAKEUP, userTokens: 850 } };
        expect(widget.render(createItem('tokens-user', true), context, DEFAULT_SETTINGS)).toBe('~850');
    });
});
