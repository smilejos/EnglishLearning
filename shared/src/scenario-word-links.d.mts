export function scenarioStoryTokens(text: string): RegExpMatchArray[];
export function validateScenarioWordLinkSpans(text: string, links: Array<{ start: number; end: number; surface: string; word: string }>, userSpecified?: boolean): string[];
