const API_BASE = 'https://api.ilovepdf.com/v1';

async function getAuthToken(): Promise<string> {
  const res = await fetch(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: process.env.ILOVEPDF_PUBLIC_KEY }),
  });
  if (!res.ok) throw new Error('Failed to authenticate with iLovePDF API');
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
  server: string,
  task: string,
  token: string,
  fileBuffer: ArrayBuffer,
  fileName: string
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
  server: string,
  task: string,
  token: string,
  tool: string,
  serverFilenames: string[],
  originalFilenames: string[],
  options?: Record<string, any>
): Promise<void> {
  const files = serverFilenames.map((sf, i) => ({
    server_filename: sf,
    filename: originalFilenames[i],
  }));
  const body: Record<string, any> = {
    task,
    tool,
    files,
  };
  if (options) {
    Object.assign(body, options);
  }
  const res = await fetch(`https://${server}/v1/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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

export interface ProcessOptions {
  tool: string;
  files: { buffer: ArrayBuffer; name: string }[];
  options?: Record<string, any>;
}

export async function processWithILovePDF(params: ProcessOptions): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const token = await getAuthToken();
  const { server, task } = await startTask(token, params.tool);

  const serverFilenames: string[] = [];
  for (const file of params.files) {
    const sf = await uploadFile(server, task, token, file.buffer, file.name);
    serverFilenames.push(sf);
  }

  await processTask(
    server,
    task,
    token,
    params.tool,
    serverFilenames,
    params.files.map(f => f.name),
    params.options
  );

  const resultBuffer = await downloadResult(server, task, token);
  const ext = params.tool === 'pdfjpg' ? 'zip' : 'pdf';
  const fileName = `result.${ext}`;

  return { buffer: resultBuffer, fileName };
}
