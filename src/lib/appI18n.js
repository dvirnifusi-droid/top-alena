// Runtime translation for the whole admin app. The app is authored in Hebrew;
// when the user picks another language we translate the Hebrew text that
// actually renders — no per-page edits. Strings are translated once by the
// backend (translateUi) and cached server-side + in localStorage, so it's
// instant after the first view.
//
// SAFETY: when the language is Hebrew (the default for every existing tenant)
// this module is completely inert — the observer never starts and nothing is
// touched. It only activates when someone explicitly switches language, and
// every step is wrapped so a failure degrades to untranslated (never a crash).
import { base44 } from '@/api/base44Client';

const LS_LANG = 'topalena_app_lang';
const LS_CACHE = (lang) => `topalena_tr_${lang}`;
const HEB = /[֐-׿]/;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA']);

export const APP_LANGUAGES = [
  { code: 'he', label: 'עברית', flag: '🇮🇱', dir: 'rtl' },
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'es', label: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺', dir: 'ltr' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
];

let current = 'he';
let cache = {};
let observer = null;
let pending = new Set();
let flushTimer = null;
let flushing = false;

export function getAppLanguage() {
  try { return localStorage.getItem(LS_LANG) || 'he'; } catch { return 'he'; }
}

// Raw stored choice — null when the user has NEVER picked a language (so we may
// fall back to the tenant default). Distinct from getAppLanguage()'s 'he'.
function storedChoice() {
  try { return localStorage.getItem(LS_LANG); } catch { return null; }
}

// This tenant's admin-set default language (from backend AppSettings). Cheap,
// guarded — any failure yields 'he' so the app just stays in Hebrew.
async function fetchTenantDefault() {
  try {
    // getAppSettings is auth-gated. On public pages (no session) it would fire a
    // guaranteed 401 on every load — skip it and keep the Hebrew default.
    let hasToken = false;
    try { hasToken = !!localStorage.getItem('auth_token'); } catch { /* SSR / no storage */ }
    if (!hasToken) return 'he';
    const res = await base44.functions.getAppSettings({});
    return res?.default_language || res?.data?.default_language || 'he';
  } catch { return 'he'; }
}

function loadCache(lang) {
  try { cache = JSON.parse(localStorage.getItem(LS_CACHE(lang)) || '{}') || {}; } catch { cache = {}; }
}
function saveCache(lang) {
  try { localStorage.setItem(LS_CACHE(lang), JSON.stringify(cache)); } catch { /* quota */ }
}

function applyTextNode(node) {
  const raw = node.nodeValue;
  if (!raw || !HEB.test(raw)) return;
  const key = raw.trim();
  if (!key) return;
  const tr = cache[key];
  if (tr != null) {
    if (tr !== key) node.nodeValue = raw.replace(key, () => tr); // fn-replace → no $-pattern issues
  } else {
    pending.add(key);
  }
}

function applyAttrs(el) {
  for (const attr of ['placeholder', 'title', 'aria-label']) {
    const v = el.getAttribute && el.getAttribute(attr);
    if (v && HEB.test(v)) {
      const key = v.trim();
      const tr = cache[key];
      if (tr != null) { if (tr !== key) el.setAttribute(attr, v.replace(key, () => tr)); }
      else pending.add(key);
    }
  }
}

function scan(root) {
  if (current === 'he' || !root) return;
  try {
    const nodeRoot = root.nodeType === 1 ? root : document.body;
    const walker = document.createTreeWalker(nodeRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !HEB.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) applyTextNode(n);
    if (nodeRoot.querySelectorAll) {
      applyAttrs(nodeRoot);
      nodeRoot.querySelectorAll('[placeholder],[title],[aria-label]').forEach(applyAttrs);
    }
    scheduleFlush();
  } catch { /* never break the page */ }
}

function scheduleFlush() {
  if (flushTimer || flushing || !pending.size) return;
  flushTimer = setTimeout(flush, 300);
}

async function flush() {
  flushTimer = null;
  if (flushing || current === 'he') return;
  const batch = [...pending].slice(0, 400);
  if (!batch.length) return;
  flushing = true;
  batch.forEach((s) => pending.delete(s));
  try {
    const res = await base44.functions.translateUi({ strings: batch, target: current });
    const map = res?.translations || res?.data?.translations || {};
    let got = false;
    for (const [k, v] of Object.entries(map)) { cache[k] = v; got = true; }
    // Cache the misses too (as identity) so we don't re-request forever.
    for (const s of batch) if (cache[s] == null) cache[s] = s;
    if (got) { saveCache(current); scan(document.body); }
  } catch { /* leave untranslated; will retry on next scan */ }
  flushing = false;
  if (pending.size) scheduleFlush();
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    if (current === 'he') return;
    for (const m of muts) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) scan(n);
          else if (n.nodeType === 3) applyTextNode(n);
        });
      } else if (m.type === 'characterData') {
        applyTextNode(m.target);
      }
    }
    scheduleFlush();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function setDir(meta) {
  try {
    document.documentElement.lang = meta.code;
    document.documentElement.dir = meta.dir;
  } catch { /* ignore */ }
}

export function setAppLanguage(lang) {
  try { localStorage.setItem(LS_LANG, lang); } catch { /* ignore */ }
  const meta = APP_LANGUAGES.find((l) => l.code === lang);
  if (!meta || lang === 'he') {
    // Restoring Hebrew: reload so React re-renders the original source strings.
    try { localStorage.setItem(LS_LANG, 'he'); } catch { /* ignore */ }
    window.location.reload();
    return;
  }
  current = lang;
  setDir(meta);
  loadCache(lang);
  startObserver();
  scan(document.body);
}

// Admin action: make `lang` the default for EVERY staffer of this business.
// Staff who never picked their own language will open in this language.
export async function setTenantDefaultLanguage(lang) {
  await base44.functions.setAppSettings({ default_language: lang });
}

// Activate a language WITHOUT persisting it as the user's choice (used for the
// tenant default). Deferred to after first paint so React has rendered.
function activateDeferred(lang) {
  const meta = APP_LANGUAGES.find((l) => l.code === lang);
  if (!meta || lang === 'he') return;
  current = lang;
  setDir(meta);
  loadCache(lang);
  const kick = () => { startObserver(); scan(document.body); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(kick, 0));
  else setTimeout(kick, 50);
}

// Call once on app boot. If the user has explicitly picked a language we honor
// it; otherwise we follow the business's default (AppSettings). No-op for
// Hebrew → zero cost/risk. Every path is guarded → never blocks the app.
export function initAppLanguage() {
  const chosen = storedChoice();
  if (chosen) { activateDeferred(chosen); return; } // user's own pick wins
  // Never chose → adopt the tenant default (does NOT write localStorage, so it
  // keeps tracking the business default and a later admin change takes effect).
  fetchTenantDefault().then((lang) => { if (lang && lang !== 'he') activateDeferred(lang); }).catch(() => {});
}
