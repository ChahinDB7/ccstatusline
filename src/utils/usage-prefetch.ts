import type { StatusJSON } from '../types/StatusJSON';
import type { WidgetItem } from '../types/Widget';

import type { UsageData } from './usage';
import { fetchUsageData } from './usage';

const SESSION_USAGE_WIDGET_TYPES = ['session-usage', 'block-timer', 'reset-timer'];
const WEEKLY_USAGE_WIDGET_TYPES = ['weekly-usage', 'weekly-reset-timer'];
const USAGE_WIDGET_TYPES = new Set<string>([
    ...SESSION_USAGE_WIDGET_TYPES,
    ...WEEKLY_USAGE_WIDGET_TYPES
]);

export function hasUsageDependentWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => USAGE_WIDGET_TYPES.has(item.type)));
}

function epochSecondsToIsoString(epochSeconds: number | null | undefined): string | undefined {
    if (epochSeconds === null || epochSeconds === undefined || !Number.isFinite(epochSeconds)) {
        return undefined;
    }
    return new Date(epochSeconds * 1000).toISOString();
}

export function extractUsageDataFromRateLimits(rateLimits: StatusJSON['rate_limits']): UsageData | null {
    if (!rateLimits) {
        return null;
    }

    const sessionUsage = rateLimits.five_hour?.used_percentage ?? undefined;
    const sessionResetAt = epochSecondsToIsoString(rateLimits.five_hour?.resets_at);
    const weeklyUsage = rateLimits.seven_day?.used_percentage ?? undefined;
    const weeklyResetAt = epochSecondsToIsoString(rateLimits.seven_day?.resets_at);

    if (sessionUsage === undefined && weeklyUsage === undefined) {
        return null;
    }

    // Note: rate_limits does not include extra_usage data (extraUsageEnabled, etc.).
    // Those fields are only available via the API fetch path.
    return { sessionUsage, sessionResetAt, weeklyUsage, weeklyResetAt };
}

interface UsageNeeds {
    session: boolean;
    weekly: boolean;
}

function getUsageNeeds(lines: WidgetItem[][]): UsageNeeds {
    const types = new Set(lines.flatMap(line => line.map(item => item.type)));
    return {
        session: SESSION_USAGE_WIDGET_TYPES.some(type => types.has(type)),
        weekly: WEEKLY_USAGE_WIDGET_TYPES.some(type => types.has(type))
    };
}

function hasCompleteSessionData(usageData: UsageData | null): boolean {
    return usageData?.sessionUsage !== undefined && usageData.sessionResetAt !== undefined;
}

function hasCompleteWeeklyData(usageData: UsageData | null): boolean {
    return usageData?.weeklyUsage !== undefined && usageData.weeklyResetAt !== undefined;
}

function overlayDefined(base: UsageData, overlay: UsageData): UsageData {
    const merged: UsageData = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        if (value !== undefined) {
            (merged as Record<string, unknown>)[key] = value;
        }
    }
    return merged;
}

export async function prefetchUsageDataIfNeeded(lines: WidgetItem[][], data?: StatusJSON): Promise<UsageData | null> {
    if (!hasUsageDependentWidgets(lines)) {
        return null;
    }

    // rate_limits from Claude Code is live, so prefer it over the API. It only has to cover
    // the windows the configured widgets show: plans without a session limit omit five_hour.
    const rateLimitsData = extractUsageDataFromRateLimits(data?.rate_limits);
    const needs = getUsageNeeds(lines);
    const sessionCovered = !needs.session || hasCompleteSessionData(rateLimitsData);
    const weeklyCovered = !needs.weekly || hasCompleteWeeklyData(rateLimitsData);

    if (rateLimitsData && sessionCovered && weeklyCovered) {
        return rateLimitsData;
    }

    const apiData = await fetchUsageData();
    if (!rateLimitsData) {
        return apiData;
    }

    // The API failed or lacks a window, but the payload still has live numbers: keep those
    // rather than replacing them with an error message.
    return overlayDefined({ ...apiData, error: undefined }, rateLimitsData);
}
