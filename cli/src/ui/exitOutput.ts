let pending = '';

export function setExitOutput(text: string) {
  pending = text;
}

export function consumeExitOutput(): string {
  const out = pending;
  pending = '';
  return out;
}
