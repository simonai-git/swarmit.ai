const SUPERMEMORY_BASE_URL = 'https://api.supermemory.ai/v3';

function getApiKey(): string | undefined {
  return process.env.SUPERMEMORY_API_KEY;
}

export async function addAgentMemory(
  agentId: string,
  content: string,
  metadata?: Record<string, string>
): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) return;

  const customId = `${agentId}-${Date.now()}`;
  const res = await fetch(`${SUPERMEMORY_BASE_URL}/documents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      containerTag: agentId,
      customId,
      metadata: metadata || {},
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supermemory add failed: ${res.status} ${text}`);
  }
}

export async function searchAgentMemory(
  agentId: string,
  query: string
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) return '';

  const res = await fetch(`${SUPERMEMORY_BASE_URL}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      containerTags: [agentId],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supermemory search failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const results = data.results || data.documents || [];
  if (results.length === 0) return '';

  return results
    .map((r: { content?: string; text?: string }, i: number) => `${i + 1}. ${r.content || r.text || ''}`)
    .join('\n');
}

export async function clearAgentMemory(agentId: string): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) return;

  const res = await fetch(`${SUPERMEMORY_BASE_URL}/container-tags/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supermemory clear failed: ${res.status} ${text}`);
  }
}
