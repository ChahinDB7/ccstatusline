import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { getTranscriptMakeup } from '../jsonl-makeup';

let tempDir: string;

function writeTranscript(entries: unknown[]): string {
    const filePath = path.join(tempDir, 'session.jsonl');
    fs.writeFileSync(filePath, entries.map(e => JSON.stringify(e)).join('\n'), 'utf-8');
    return filePath;
}

function userText(text: string) {
    return { type: 'user', message: { role: 'user', content: text } };
}

function assistantBlocks(blocks: unknown[], usage?: object) {
    return { type: 'assistant', message: { role: 'assistant', content: blocks, ...(usage ? { usage } : {}) } };
}

describe('getTranscriptMakeup', () => {
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-makeup-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns null for a missing transcript', async () => {
        expect(await getTranscriptMakeup(path.join(tempDir, 'missing.jsonl'))).toBeNull();
    });

    it('estimates categories at chars/4 when no usage is recorded', async () => {
        const filePath = writeTranscript([
            userText('u'.repeat(400)),
            assistantBlocks([{ type: 'text', text: 'a'.repeat(200) }])
        ]);

        const makeup = await getTranscriptMakeup(filePath);
        expect(makeup).toEqual({
            userTokens: 100,
            assistantTokens: 50,
            thinkingTokens: 0,
            toolTokens: 0,
            toolCallTokens: 0,
            toolOutputTokens: 0,
            measured: false
        });
    });

    it('calibrates the ratio against the last recorded usage', async () => {
        // 400 user chars + 400 assistant chars = 800 model chars; measured
        // context of 400 tokens gives a ratio of 0.5 instead of 0.25.
        const filePath = writeTranscript([
            userText('u'.repeat(400)),
            assistantBlocks(
                [{ type: 'text', text: 'a'.repeat(400) }],
                { input_tokens: 100, cache_read_input_tokens: 250, cache_creation_input_tokens: 50 }
            )
        ]);

        const makeup = await getTranscriptMakeup(filePath);
        expect(makeup).toEqual({
            userTokens: 200,
            assistantTokens: 200,
            thinkingTokens: 0,
            toolTokens: 0,
            toolCallTokens: 0,
            toolOutputTokens: 0,
            measured: true
        });
    });

    it('uses the LAST assistant usage, not an earlier one', async () => {
        const filePath = writeTranscript([
            userText('u'.repeat(100)),
            assistantBlocks([{ type: 'text', text: 'a'.repeat(100) }], { input_tokens: 999999 }),
            assistantBlocks([{ type: 'text', text: 'b'.repeat(100) }], { input_tokens: 150 })
        ]);

        // 300 model chars, last usage 150 tokens -> ratio 0.5
        const makeup = await getTranscriptMakeup(filePath);
        expect(makeup?.userTokens).toBe(50);
        expect(makeup?.assistantTokens).toBe(100);
        expect(makeup?.measured).toBe(true);
    });

    it('counts tool_use input JSON + name and string tool_result content as tool tokens', async () => {
        const input = { file_path: '/tmp/x' };
        const toolUseChars = JSON.stringify(input).length + 'Read'.length;
        const filePath = writeTranscript([
            assistantBlocks([{ type: 'tool_use', id: 't1', name: 'Read', input }]),
            { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'r'.repeat(60) }] } }
        ]);

        const makeup = await getTranscriptMakeup(filePath);
        expect(makeup?.toolTokens).toBe(Math.round((toolUseChars + 60) * 0.25));
        expect(makeup?.toolCallTokens).toBe(Math.round(toolUseChars * 0.25));
        expect(makeup?.toolOutputTokens).toBe(15);
        expect(makeup?.userTokens).toBe(0);
    });

    it('counts tool_result block lists by text length, falling back to JSON length', async () => {
        const imageBlock = { type: 'image', source: { data: 'x'.repeat(20) } };
        const filePath = writeTranscript([
            {
                type: 'user',
                message: {
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: 't1',
                        content: [{ type: 'text', text: 'y'.repeat(40) }, imageBlock]
                    }]
                }
            }
        ]);

        const makeup = await getTranscriptMakeup(filePath);
        expect(makeup?.toolTokens).toBe(Math.round((40 + JSON.stringify(imageBlock).length) * 0.25));
        expect(makeup?.toolOutputTokens).toBe(makeup?.toolTokens);
        expect(makeup?.toolCallTokens).toBe(0);
    });

    it('counts thinking text but not the signature', async () => {
        const filePath = writeTranscript([
            assistantBlocks([{ type: 'thinking', thinking: 't'.repeat(80), signature: 's'.repeat(5000) }])
        ]);

        const makeup = await getTranscriptMakeup(filePath);
        expect(makeup?.thinkingTokens).toBe(20);
    });

    it('splits text blocks between user and assistant by role', async () => {
        const filePath = writeTranscript([
            { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'u'.repeat(40) }] } },
            assistantBlocks([{ type: 'text', text: 'a'.repeat(80) }])
        ]);

        const makeup = await getTranscriptMakeup(filePath);
        expect(makeup?.userTokens).toBe(10);
        expect(makeup?.assistantTokens).toBe(20);
    });

    it('ignores malformed lines and records without messages', async () => {
        const filePath = path.join(tempDir, 'session.jsonl');
        fs.writeFileSync(filePath, [
            'not json at all',
            JSON.stringify({ type: 'file-history-snapshot', snapshot: { big: 'x'.repeat(500) } }),
            JSON.stringify(userText('u'.repeat(40)))
        ].join('\n'), 'utf-8');

        const makeup = await getTranscriptMakeup(filePath);
        expect(makeup?.userTokens).toBe(10);
        expect(makeup?.toolTokens).toBe(0);
    });

    it('returns zeros for a transcript with no countable content', async () => {
        const filePath = writeTranscript([{ type: 'system', subtype: 'init' }]);

        const makeup = await getTranscriptMakeup(filePath);
        expect(makeup).toEqual({
            userTokens: 0,
            assistantTokens: 0,
            thinkingTokens: 0,
            toolTokens: 0,
            toolCallTokens: 0,
            toolOutputTokens: 0,
            measured: false
        });
    });
});
