/**
 * Call a backend function without requiring authentication.
 * Used for public pages like QueueJoin.
 * The new self-hosted API exposes a /api/public/fn/<name> route
 * (or the same /api/fn/<name> if the function handler opts out of auth).
 */
const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api';

export async function invokePublic(functionName, payload = {}) {
  const url = `${API_BASE}/public/fn/${functionName}`;
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
