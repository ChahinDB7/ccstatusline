import * as fs from 'fs';
import path from 'path';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance
} from 'vitest';

import {
    CURRENT_VERSION,
    DEFAULT_SETTINGS,
    MIN_LINE_COUNT,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';

const MOCK_HOME_DIR = '/tmp/ccstatusline-config-test-home';
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;

let loadSettings: () => Promise<Settings>;
let saveSettings: (settings: Settings) => Promise<void>;
let initConfigPath: (filePath?: string) => void;
let ensureMinimumLines: (lines: WidgetItem[][], minimum?: number) => WidgetItem[][];
let consoleErrorSpy: MockInstance<typeof console.error>;

function getSettingsPaths(): { configDir: string; settingsPath: string; backupPath: string } {
    const configDir = path.join(MOCK_HOME_DIR, '.config', 'ccstatusline');
    return {
        configDir,
        settingsPath: path.join(configDir, 'settings.json'),
        backupPath: path.join(configDir, 'settings.bak')
    };
}

function getClaudeConfigDir(): string {
    return path.join(MOCK_HOME_DIR, '.claude');
}

describe('config utilities', () => {
    beforeAll(async () => {
        const configModule = await import('../config');
        loadSettings = configModule.loadSettings;
        saveSettings = configModule.saveSettings;
        initConfigPath = configModule.initConfigPath;
        ensureMinimumLines = configModule.ensureMinimumLines;
    });

    beforeEach(() => {
        fs.rmSync(MOCK_HOME_DIR, { recursive: true, force: true });
        process.env.CLAUDE_CONFIG_DIR = getClaudeConfigDir();
        const { settingsPath } = getSettingsPaths();
        initConfigPath(settingsPath);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    afterAll(() => {
        fs.rmSync(MOCK_HOME_DIR, { recursive: true, force: true });
        if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
        }
        initConfigPath();
    });

    it('writes defaults when settings file does not exist', async () => {
        const { settingsPath } = getSettingsPaths();

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(fs.existsSync(settingsPath)).toBe(true);

        const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
            version?: number;
            lines?: unknown[];
        };
        expect(onDisk.version).toBe(CURRENT_VERSION);
        expect(Array.isArray(onDisk.lines)).toBe(true);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Default settings written to')
        );
    });

    it('backs up invalid JSON and recovers with defaults', async () => {
        const { settingsPath, backupPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(settingsPath, '{ invalid json', 'utf-8');

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(fs.existsSync(backupPath)).toBe(true);
        expect(fs.readFileSync(backupPath, 'utf-8')).toBe('{ invalid json');

        const recovered = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(recovered.version).toBe(CURRENT_VERSION);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to parse settings.json, backing up and using defaults'
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Bad settings backed up to')
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Default settings written to')
        );
    });

    it('backs up invalid v1 payloads and recovers with defaults', async () => {
        const { settingsPath, backupPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify({ flexMode: 123 }), 'utf-8');

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        expect(fs.existsSync(backupPath)).toBe(true);
        const recovered = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(recovered.version).toBe(CURRENT_VERSION);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Invalid v1 settings format:',
            expect.anything()
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Bad settings backed up to')
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Default settings written to')
        );
    });

    it('migrates older versioned settings and persists migrated result', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            settingsPath,
            JSON.stringify({
                version: 2,
                lines: [[{ id: 'widget-1', type: 'model' }]]
            }),
            'utf-8'
        );

        const settings = await loadSettings();

        expect(settings.version).toBe(CURRENT_VERSION);
        const migrated = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
            version?: number;
            updatemessage?: { message?: string };
        };
        expect(migrated.version).toBe(CURRENT_VERSION);
        expect(migrated.updatemessage?.message).toContain('v2.0.2');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('always saves current version in saveSettings', async () => {
        const { settingsPath } = getSettingsPaths();

        await saveSettings({
            ...DEFAULT_SETTINGS,
            version: 1
        });

        const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { version?: number };
        expect(saved.version).toBe(CURRENT_VERSION);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('silently rewrites legacy git-pr widget type to git-review on load', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            settingsPath,
            JSON.stringify({
                version: CURRENT_VERSION,
                lines: [
                    [
                        { id: 'widget-1', type: 'model' },
                        { id: 'widget-2', type: 'git-pr' }
                    ],
                    [],
                    []
                ]
            }),
            'utf-8'
        );

        const settings = await loadSettings();

        // In-memory rewrite: legacy string is gone.
        const types = settings.lines[0]?.map(item => item.type);
        expect(types).toEqual(['model', 'git-review']);

        // Load does not eagerly persist; the rewrite lands on next save.
        const onDiskBeforeSave = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { lines: { type: string }[][] };
        expect(onDiskBeforeSave.lines[0]?.[1]?.type).toBe('git-pr');

        await saveSettings(settings);

        const onDiskAfterSave = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { lines: { type: string }[][] };
        expect(onDiskAfterSave.lines[0]?.[1]?.type).toBe('git-review');
    });

    it('defaults to MIN_LINE_COUNT lines with the extra lines empty', () => {
        expect(MIN_LINE_COUNT).toBe(4);
        expect(DEFAULT_SETTINGS.lines).toHaveLength(MIN_LINE_COUNT);
        expect(DEFAULT_SETTINGS.lines[0]?.length).toBeGreaterThan(0);
        for (let i = 1; i < MIN_LINE_COUNT; i++) {
            expect(DEFAULT_SETTINGS.lines[i]).toEqual([]);
        }
    });

    describe('ensureMinimumLines', () => {
        it('pads a short list up to the minimum with empty lines', () => {
            const lines: WidgetItem[][] = [[{ id: 'a', type: 'model' }]];
            const padded = ensureMinimumLines(lines, 4);

            expect(padded).toHaveLength(4);
            expect(padded[0]).toBe(lines[0]); // existing line kept as-is
            expect(padded[1]).toEqual([]);
            expect(padded[2]).toEqual([]);
            expect(padded[3]).toEqual([]);
        });

        it('never drops lines from a config that already has enough', () => {
            const lines: WidgetItem[][] = [
                [{ id: 'a', type: 'model' }],
                [{ id: 'b', type: 'git-branch' }],
                [{ id: 'c', type: 'version' }],
                [{ id: 'd', type: 'session-cost' }],
                [{ id: 'e', type: 'terminal-width' }]
            ];
            const result = ensureMinimumLines(lines, 4);

            expect(result).toHaveLength(5);
            expect(result).toBe(lines); // returned unchanged
        });

        it('is idempotent', () => {
            const once = ensureMinimumLines([[{ id: 'a', type: 'model' }]], 4);
            const twice = ensureMinimumLines(once, 4);
            expect(twice).toEqual(once);
        });
    });

    it('keeps an existing 3-line config intact and exposes an optional 4th line', async () => {
        const { settingsPath, configDir } = getSettingsPaths();
        fs.mkdirSync(configDir, { recursive: true });

        // Mirrors a real user config: three current lines, current version.
        const existing = {
            version: CURRENT_VERSION,
            lines: [
                [{ id: 'l1', type: 'context-bar' }],
                [{ id: 'l2', type: 'session-usage', color: 'yellow' }],
                [{ id: 'l3', type: 'weekly-usage', color: 'brightCyan' }]
            ]
        };
        fs.writeFileSync(settingsPath, JSON.stringify(existing), 'utf-8');

        const settings = await loadSettings();

        // The three configured lines are preserved exactly.
        expect(settings.lines[0]).toEqual(existing.lines[0]);
        expect(settings.lines[1]).toEqual(existing.lines[1]);
        expect(settings.lines[2]).toEqual(existing.lines[2]);

        // A 4th line is exposed for editing, and it is empty (optional / hidden).
        expect(settings.lines).toHaveLength(MIN_LINE_COUNT);
        expect(settings.lines[3]).toEqual([]);

        // Loading does NOT rewrite the file: the on-disk config still has 3 lines.
        const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as { lines: unknown[] };
        expect(onDisk.lines).toHaveLength(3);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});
