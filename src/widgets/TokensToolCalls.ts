import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import {
    getMakeupWidgetDescription,
    getMakeupWidgetDisplayName,
    renderMakeupWidgetValue
} from './shared/makeup-widget';

export class TokensToolCallsWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return getMakeupWidgetDescription('tool-calls'); }
    getDisplayName(): string { return getMakeupWidgetDisplayName('tool-calls'); }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderMakeupWidgetValue('tool-calls', item, context);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
