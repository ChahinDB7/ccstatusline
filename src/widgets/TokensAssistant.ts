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

export class TokensAssistantWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return getMakeupWidgetDescription('assistant'); }
    getDisplayName(): string { return getMakeupWidgetDisplayName('assistant'); }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderMakeupWidgetValue('assistant', item, context);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
