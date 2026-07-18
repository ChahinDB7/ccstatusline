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

export class TokensUserWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return getMakeupWidgetDescription('user'); }
    getDisplayName(): string { return getMakeupWidgetDisplayName('user'); }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderMakeupWidgetValue('user', item, context);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
