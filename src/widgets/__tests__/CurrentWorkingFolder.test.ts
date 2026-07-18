import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { CurrentWorkingFolderWidget } from '../CurrentWorkingFolder';

const widget = new CurrentWorkingFolderWidget();

function createItem(rawValue = false): WidgetItem {
    return { id: 'cwf', type: 'current-working-folder', rawValue };
}

function contextWithCwd(cwd?: string): RenderContext {
    return { data: cwd !== undefined ? { cwd } : undefined } as RenderContext;
}

describe('CurrentWorkingFolderWidget', () => {
    it('has correct metadata', () => {
        expect(widget.getDisplayName()).toBe('Current Working Folder');
        expect(widget.getCategory()).toBe('Environment');
        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.supportsColors(createItem())).toBe(true);
    });

    it('renders labelled and raw previews', () => {
        expect(widget.render(createItem(), { isPreview: true }, DEFAULT_SETTINGS)).toBe('./my-project');
        expect(widget.render(createItem(true), { isPreview: true }, DEFAULT_SETTINGS)).toBe('my-project');
    });

    it('shows only the folder name of a deep path', () => {
        const context = contextWithCwd('/Volumes/Samsung SSD/Own Projects/herdr');
        expect(widget.render(createItem(), context, DEFAULT_SETTINGS)).toBe('./herdr');
    });

    it('returns the raw folder name when requested', () => {
        const context = contextWithCwd('/Users/example/dev/my-app');
        expect(widget.render(createItem(true), context, DEFAULT_SETTINGS)).toBe('my-app');
    });

    it('handles Windows-style paths', () => {
        const context = contextWithCwd('C:\\Users\\example\\projects\\my-app');
        expect(widget.render(createItem(true), context, DEFAULT_SETTINGS)).toBe('my-app');
    });

    it('ignores trailing slashes', () => {
        const context = contextWithCwd('/Users/example/dev/my-app/');
        expect(widget.render(createItem(true), context, DEFAULT_SETTINGS)).toBe('my-app');
    });

    it('falls back to the path itself at the filesystem root', () => {
        const context = contextWithCwd('/');
        expect(widget.render(createItem(true), context, DEFAULT_SETTINGS)).toBe('/');
    });

    it('returns null when no cwd is available', () => {
        expect(widget.render(createItem(), contextWithCwd(), DEFAULT_SETTINGS)).toBeNull();
        expect(widget.render(createItem(), {}, DEFAULT_SETTINGS)).toBeNull();
    });
});
