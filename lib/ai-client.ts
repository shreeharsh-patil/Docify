export async function processWithAI(
  action: 'summarize' | 'translate',
  text: string,
  options?: { language?: string; length?: string }
): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, text, ...options }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'AI request failed' }));
    throw new Error(err.error || 'AI processing failed');
  }

  const data = await res.json();
  return data.content;
}
