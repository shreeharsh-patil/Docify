const API_BASE = 'https://api.ilovepdf.com/v1';

interface KeyPair {
  publicKey: string;
  secretKey: string;
}

function getKeyPairs(): KeyPair[] {
  const pairs: KeyPair[] = [];
  for (let i = 1; i <= 10; i++) {
    const pk = process.env[`ILOVEPDF_PUBLIC_KEY_${i}`];
    const sk = process.env[`ILOVEPDF_SECRET_KEY_${i}`];
    if (pk && sk && pk !== 'your_public_key_here' && sk !== 'your_secret_key_here') {
      pairs.push({ publicKey: pk, secretKey: sk });
    }
  }
  return pairs;
}

async function getAuthToken(publicKey: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: publicKey }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed: ${text}`);
  }
  const data = await res.json();
  return data.token;
}

async function startTask(token: string, tool: string): Promise<{ server: string; task: string }> {
  const res = await fetch(`${API_BASE}/start/${tool}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to start ${tool} task`);
  return res.json();
}

async function uploadFile(
  server: string, task: string, token: string,
  fileBuffer: ArrayBuffer, fileName: string
): Promise<string> {
  const formData = new FormData();
  formData.append('task', task);
  formData.append('file', new Blob([fileBuffer]), fileName);
  const res = await fetch(`https://${server}/v1/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload file');
  const data = await res.json();
  return data.server_filename;
}

async function processTask(
  server: string, task: string, token: string,
  tool: string, serverFilenames: string[],
  originalFilenames: string[], options?: Record<string, any>
): Promise<void> {
  const files = serverFilenames.map((sf, i) => ({
    server_filename: sf,
    filename: originalFilenames[i],
  }));
  const body: Record<string, any> = { task, tool, files };
  if (options) Object.assign(body, options);
  const res = await fetch(`https://${server}/v1/process`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Processing failed: ${err}`);
  }
}

async function downloadResult(server: string, task: string, token: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://${server}/v1/download/${task}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to download result');
  return res.arrayBuffer();
}

async function processWithOneKey(
  keyPair: KeyPair, params: ProcessOptions
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const token = await getAuthToken(keyPair.publicKey);
  const { server, task } = await startTask(token, params.tool);

  const serverFilenames: string[] = [];
  for (const file of params.files) {
    const sf = await uploadFile(server, task, token, file.buffer, file.name);
    serverFilenames.push(sf);
  }

  await processTask(server, task, token, params.tool, serverFilenames,
    params.files.map(f => f.name), params.options);

  const resultBuffer = await downloadResult(server, task, token);
  const ext = params.tool === 'pdfjpg' ? 'zip' : 'pdf';
  return { buffer: resultBuffer, fileName: `result.${ext}` };
}

export interface ProcessOptions {
  tool: string;
  files: { buffer: ArrayBuffer; name: string }[];
  options?: Record<string, any>;
}

export async function processWithILovePDF(params: ProcessOptions): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const pairs = getKeyPairs();

  if (pairs.length === 0) {
    throw new Error(
      'iLovePDF API keys not configured. Get free keys at https://developer.ilovepdf.com ' +
      'and set ILOVEPDF_PUBLIC_KEY_1 and ILOVEPDF_SECRET_KEY_1 in .env.local'
    );
  }

  const errors: string[] = [];
  for (let i = 0; i < pairs.length; i++) {
    try {
      return await processWithOneKey(pairs[i], params);
    } catch (e: any) {
      const msg = e.message || String(e);
      errors.push(`Key pair #${i + 1}: ${msg}`);
      // If it's not an auth/credit error, don't retry
      if (!msg.includes('401') && !msg.includes('403') && !msg.includes('429') &&
          !msg.includes('credit') && !msg.includes('Auth failed') && !msg.includes('quota')) {
        throw e;
      }
    }
  }

  throw new Error(
    `All ${pairs.length} API key pair(s) failed:\n${errors.join('\n')}\n\n` +
    'Add more keys in .env.local (ILOVEPDF_PUBLIC_KEY_2 / ILOVEPDF_SECRET_KEY_2) or top up credits.'
  );
}

// Keep individual function exports for the API route to use
export { getKeyPairs, processWithOneKey };
