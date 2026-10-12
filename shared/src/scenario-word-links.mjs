// 與離線套件預檢共用；索引為 JavaScript 字串的 UTF-16 offset。
export function scenarioStoryTokens(text) {
  return [...text.matchAll(/\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*/gu)];
}

const normalizedPhrase = (text) => text.normalize('NFC').toLowerCase().replaceAll('’', "'");

/** 每個文字 token 恰好覆蓋一次；指定詞可將完整片語映射至單一正式 GUID。 */
export function validateScenarioWordLinkSpans(text, links, userSpecified = false) {
  const errors = [];
  const tokens = scenarioStoryTokens(text);
  let nextToken = 0;
  for (const [index, link] of links.entries()) {
    if (!link || !Number.isInteger(link.start) || !Number.isInteger(link.end) ||
        typeof link.surface !== 'string' || typeof link.word !== 'string' ||
        link.start !== tokens[nextToken]?.index || link.end <= link.start ||
        text.slice(link.start, link.end) !== link.surface || link.end !== link.start + link.surface.length) {
      errors.push(`wordLinks[${index}] 的字形或索引不符（需依序且無重疊）`);
      continue;
    }
    let after = nextToken;
    while (after < tokens.length && tokens[after].index + tokens[after][0].length <= link.end) after++;
    const last = tokens[after - 1];
    const phraseTokens = tokens.slice(nextToken, after);
    const separatorsValid = phraseTokens.every((token, i) => i === 0 ||
      /^[\s\-‐‑]+$/u.test(text.slice(phraseTokens[i - 1].index + phraseTokens[i - 1][0].length, token.index)));
    const fullPhrase = phraseTokens.length > 1 || scenarioStoryTokens(link.word).length > 1;
    if (!last || last.index + last[0].length !== link.end || !separatorsValid ||
        (fullPhrase && (!userSpecified || normalizedPhrase(link.surface) !== normalizedPhrase(link.word)))) {
      errors.push(`wordLinks[${index}] 必須對應完整單字；指定片語須與字庫完整字形一致`);
      continue;
    }
    nextToken = after;
  }
  if (nextToken !== tokens.length) errors.push('wordLinks 必須完整覆蓋所有英文單字');
  return errors;
}
