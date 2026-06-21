export async function processViaILovePDF(
  tool: string,
  files: File[],
  options?: Record<string, any>
): Promise<{ blob: Blob; fileName: string }> {
  const formData = new FormData();
  formData.append('tool', tool);
  files.forEach(f => formData.append('files', f));
  if (options) {
    formData.append('options', JSON.stringify(options));
  }

  const res = await fetch('/api/ilovepdf', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Processing failed');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const fileNameMatch = disposition.match(/filename="?([^"]+)"?/);
  const fileName = fileNameMatch?.[1] || `result.${blob.type === 'application/zip' ? 'zip' : 'pdf'}`;

  return { blob, fileName };
}
