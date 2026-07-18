// Token count formatting, kept dependency-free so widget modules can import it
// without pulling in the renderer (which instantiates every widget and would
// create an import cycle).
export function formatTokens(count: number): string {
    if (count >= 1000000)
        return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000)
        return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
}
