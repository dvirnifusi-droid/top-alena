/**
 * Call a backend function without requiring authentication.
 * Used for public pages like QueueJoin.
 * Format: /api/apps/<appId>/functions/<functionName>
 */
import { appParams } from '@/lib/app-params';

export async function invokePublic(functionName, payload = {}) {
  const appId = appParams.appId || import.meta.env.VITE_BASE44_APP_ID;
  const url = `/api/apps/${appId}/functions/${functionName}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  return res.json();
}