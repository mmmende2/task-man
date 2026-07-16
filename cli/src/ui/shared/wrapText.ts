/**
 * Greedy word wrap. Words longer than a full line (URLs) are hard-broken.
 * Ink can't be trusted to wrap inside bordered cards — it wraps at the
 * terminal edge and drops sibling prefix columns on continuation lines —
 * so card layouts wrap their text with this and render each line explicitly.
 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  let current = '';
  const flush = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      flush();
      current = word;
    }
    while (current.length > width) {
      lines.push(current.slice(0, width));
      current = current.slice(width);
    }
  }
  flush();
  return lines.length ? lines : [''];
}
