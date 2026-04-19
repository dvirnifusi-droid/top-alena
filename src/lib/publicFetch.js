/**
 * Call a backend function without requiring authentication.
 * Used for public pages like QueueJoin.
 * Uses the direct /functions/<name> endpoint which doesn't require a user token.
 */
export async function invokePublic(functionName, payload = {}) {
  const appId = import.meta.env.VITE_BASE44_APP_ID || '';
  const res = await fetch(`/functions/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(appId ? { 'X-App-Id': appId } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed with status ${res.status}`);
  }

  return res.json();
}