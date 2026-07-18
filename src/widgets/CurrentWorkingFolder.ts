import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

/** Last path component, tolerating both separators and trailing slashes. */
function folderName(cwd: string): string {
    const parts = cwd.split(/[\\/]+/).filter(part => part !== '');
    return parts[parts.length - 1] ?? cwd;
}

export class CurrentWorkingFolderWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows only the folder name of the current working directory, prefixed with "./" (e.g. "./my-project" instead of the full path)'; }
    getDisplayName(): string { return 'Current Working Folder'; }
    getCategory(): string { return 'Environment'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, './', 'my-project');
        }

        const cwd = context.data?.cwd;
        if (!cwd)
            return null;

        return formatRawOrLabeledValue(item, './', folderName(cwd));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
