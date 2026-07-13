/**
 * Drop-in replacement for @base44/sdk that talks to our self-hosted API.
 *
 * Surface preserved (used across ~75 pages):
 *   base44.entities.<Name>.list({...}) / get(id) / create({...}) / update(id, {...}) / delete(id)
 *   base44.auth.me() / logout() / redirectToLogin()
 *   base44.integrations.Core.UploadFile({ file })
 *   base44.integrations.Core.SendEmail({ to, subject, body, html, from })
 *   base44.integrations.Core.InvokeLLM({ prompt, response_json_schema, file_urls, model })
 *   base44.integrations.Core.GenerateImage({ prompt })
 *   base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema })
 *   base44.functions.<name>(payload)
 */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api';
const TOKEN_KEY = 'auth_token';

// Impersonation token intake — if the URL has ?impersonate=<jwt>, the
// platform admin is logging in as this tenant's owner. Save it as the
// primary auth token and strip the query param so a refresh doesn't
// re-apply it.
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const impersonateToken = params.get('impersonate');
    if (impersonateToken) {
      window.localStorage.setItem(TOKEN_KEY, impersonateToken);
      window.localStorage.setItem('impersonation_active', '1');
      params.delete('impersonate');
      const clean = params.toString();
      const url = window.location.pathname + (clean ? `?${clean}` : '') + window.location.hash;
      window.history.replaceState({}, '', url);
    }
  } catch { /* noop */ }
}

const getToken = () =>
  (typeof window !== 'undefined' && window.localStorage.getItem(TOKEN_KEY)) || null;

export const setToken = (t) => {
  if (typeof window === 'undefined') return;
  if (t) window.localStorage.setItem(TOKEN_KEY, t);
  else window.localStorage.removeItem(TOKEN_KEY);
};

async function http(path, { method = 'GET', body, headers = {}, formData } = {}) {
  const tok = getToken();
  const opts = {
    method,
    headers: {
      ...(formData ? {} : { 'Content-Type': 'application/json' }),
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...headers,
    },
  };
  if (formData) opts.body = formData;
  else if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    // Prefer the human-readable message; fall back to the error code, then HTTP status.
    // For function_error responses the api returns { error: 'function_error', message: '<real reason>' };
    // showing just 'function_error' to the user is useless.
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    const err = new Error(data?.error && data?.message ? `${data.error}: ${data.message}` : msg);
    err.status = res.status;
    err.code = data?.error;
    err.data = data;
    throw err;
  }
  return data;
}

function buildQuery(params) {
  if (!params || !Object.keys(params).length) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    qs.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function makeEntity(name, { prefix = '/entities' } = {}) {
  return {
    list: (sort, limit, skip) =>
      http(`${prefix}/${name}${buildQuery({ sort, limit, skip })}`),
    filter: (where, sort, limit, skip) =>
      http(
        `${prefix}/${name}${buildQuery({
          where: where && Object.keys(where).length ? JSON.stringify(where) : undefined,
          sort,
          limit,
          skip,
        })}`,
      ),
    get: (id) => http(`${prefix}/${name}/${id}`),
    create: (data) => http(`${prefix}/${name}`, { method: 'POST', body: data }),
    update: (id, data) => http(`${prefix}/${name}/${id}`, { method: 'PUT', body: data }),
    delete: (id) => http(`${prefix}/${name}/${id}`, { method: 'DELETE' }),
    // Base44 had realtime subscriptions; the self-hosted API doesn't (yet).
    // No-op that returns an unsubscribe fn so pages don't crash; data still
    // loads via list/filter on mount.
    subscribe: (_cb) => () => {},
  };
}

function buildEntitiesProxy({ prefix = '/entities' } = {}) {
  return new Proxy(
    {},
    {
      get: (cache, name) => {
        if (typeof name !== 'string') return undefined;
        if (!cache[name]) {
          cache[name] = makeEntity(name, { prefix });
          // Base44's `User` entity exposes auth helpers on top of the CRUD API.
          if (name === 'User') {
            cache[name].me = () => http('/auth/me');
            cache[name].login = (email, password) => auth.login(email, password);
            cache[name].logout = () => auth.logout();
            cache[name].loginWithRedirect = (from) => auth.redirectToLogin(from);
            cache[name].updateMyUserData = async (data) => {
              const me = await http('/auth/me');
              if (!me?.id) throw new Error('not_authenticated');
              return http(`${prefix}/User/${me.id}`, { method: 'PUT', body: data });
            };
          }
        }
        return cache[name];
      },
    },
  );
}

function buildFunctionsProxy({ prefix = '/fn' } = {}) {
  // Base44 SDK returns function results as an axios-style { data, status }.
  // Components across the app read `res.data.<x>`, so wrap the raw body in
  // { data } to stay compatible.
  const call = (name, payload = {}) =>
    http(`${prefix}/${name}`, { method: 'POST', body: payload }).then((body) => ({
      data: body,
      status: 200,
    }));
  return new Proxy(
    {},
    {
      get: (cache, name) => {
        if (typeof name !== 'string') return undefined;
        if (name === 'invoke') return (fnName, payload = {}) => call(fnName, payload);
        if (!cache[name]) cache[name] = (payload = {}) => call(name, payload);
        return cache[name];
      },
    },
  );
}

const entitiesProxy = buildEntitiesProxy();
const functionsProxy = buildFunctionsProxy();
// `asServiceRole` mirrors the same surface but routes to public endpoints that
// don't require an end-user JWT (e.g. for /QueueJoin, anonymous flows, cron).
const asServiceRole = {
  entities: buildEntitiesProxy({ prefix: '/public/entities' }),
  functions: buildFunctionsProxy({ prefix: '/public/fn' }),
};

const Core = {
  UploadFile: async ({ file }) => {
    const fd = new FormData();
    fd.append('file', file);
    return http('/integrations/upload-file', { method: 'POST', formData: fd });
  },
  SendEmail: (args) =>
    http('/integrations/send-email', { method: 'POST', body: args }),
  InvokeLLM: (args) =>
    http('/integrations/invoke-llm', { method: 'POST', body: args }),
  GenerateImage: (args) =>
    http('/integrations/generate-image', { method: 'POST', body: args }),
  ExtractDataFromUploadedFile: (args) =>
    http('/integrations/extract-data', { method: 'POST', body: args }),
  CreateFileSignedUrl: ({ file_url, expires_in } = {}) =>
    http('/integrations/signed-url', {
      method: 'POST',
      body: { file_url, expires_in },
    }),
};

const auth = {
  me: () => http('/auth/me'),
  login: async (email, password) => {
    const res = await http('/auth/login', { method: 'POST', body: { email, password } });
    setToken(res.token);
    return res.user;
  },
  register: async (email, password) => {
    const res = await http('/auth/register', { method: 'POST', body: { email, password } });
    setToken(res.token);
    return res.user;
  },
  // Sign in with a Google ID token (credential from Google Identity Services).
  googleLogin: async (credential) => {
    const res = await http('/auth/google', { method: 'POST', body: { credential } });
    // Response is one of: {token,user} (logged in here) | {route_to,handoff}
    // (belongs to one other restaurant) | {choose_tenant,handoff} (several).
    if (res.token) setToken(res.token);
    return res;
  },
  // Central multi-tenant Google sign-in. On the hosted handoff page (topalena.com)
  // exchange the Google credential for a short-lived handoff token…
  googleHandoff: async (credential) => {
    const res = await http('/auth/google-handoff', { method: 'POST', body: { credential } });
    return res.handoff;
  },
  // …and back on the tenant subdomain, exchange that handoff token for a session.
  googleConsume: async (handoff) => {
    const res = await http('/auth/google-consume', { method: 'POST', body: { handoff } });
    setToken(res.token);
    return res.user;
  },
  logout: (redirectTo) => {
    setToken(null);
    if (redirectTo && typeof window !== 'undefined') window.location.href = redirectTo;
  },
  redirectToLogin: (from) => {
    if (typeof window === 'undefined') return;
    const qs = from ? `?from=${encodeURIComponent(from)}` : '';
    window.location.href = `/login${qs}`;
  },
};

const agents = {
  // Returns a deep link your recruitment WhatsApp agent is reachable at.
  // Configure VITE_RECRUITMENT_WHATSAPP_URL to your own bot link.
  getWhatsAppConnectURL: (_agentName) =>
    import.meta.env.VITE_RECRUITMENT_WHATSAPP_URL || '',
};

export const base44 = {
  entities: entitiesProxy,
  functions: functionsProxy,
  integrations: { Core },
  auth,
  agents,
  asServiceRole,
};
