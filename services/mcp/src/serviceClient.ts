import { UserError } from 'fastmcp';
import type { MCPSession } from './auth';
import { getOboToken } from './oboToken';

export async function callService(
  baseUrl: string,
  path: string,
  method: string,
  session: MCPSession,
  toolName: string,
  body?: unknown,
): Promise<unknown> {
  const token = await getOboToken(session, toolName);

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `${method} ${path} failed (${res.status})`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) message = j.error;
    } catch { /* ignore parse errors */ }
    throw new UserError(message);
  }

  if (res.status === 204) return null;
  return res.json();
}
