// App Builder — global term substitution for FREE TEXT that pages author with
// plain <p>/<span>/<h*>/<div> (not through the shared UI primitives). A single
// MutationObserver rewrites matching text nodes app-wide.
//
// SAFETY — this is opt-in and low-blast-radius by construction:
//   • Attached ONLY when the tenant has active term renames (hasTermOverrides).
//     Tenants with no renames never install the observer → zero cost/risk.
//   • Skips inputs/textareas/selects/code/pre/script/style/[contenteditable]
//     and any subtree marked data-no-term, so it never touches editable values.
//   • applyTermsGlobal is idempotent (after שולחן→חדר there's no שולחן left), and
//     we only write when the value actually changes — so our own writes don't
//     loop the observer.
//   • Batched via requestAnimationFrame; only mutated subtrees are re-walked.
import { applyTermsGlobal, hasTermOverrides } from '@/hooks/useAppConfig';

const SKIP_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'SVG', 'PATH']);
let observer = null;
let scheduled = false;
const pending = new Set();

function isSkipped(el) {
  let cur = el;
  while (cur && cur.nodeType === 1) {
    if (SKIP_TAGS.has(cur.tagName)) return true;
    if (cur.isContentEditable) return true;
    if (cur.hasAttribute && cur.hasAttribute('data-no-term')) return true;
    cur = cur.parentElement;
  }
  return false;
}

function processText(node) {
  const v = node.nodeValue;
  if (!v || !v.trim()) return;
  if (isSkipped(node.parentElement)) return;
  const nv = applyTermsGlobal(v);
  if (nv !== v) node.nodeValue = nv;
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { processText(root); return; }
  if (root.nodeType !== 1) return;
  if (SKIP_TAGS.has(root.tagName) || root.isContentEditable || (root.hasAttribute && root.hasAttribute('data-no-term'))) return;
  let tw;
  try { tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); } catch { return; }
  let n; while ((n = tw.nextNode())) processText(n);
}

function flush() {
  scheduled = false;
  const nodes = Array.from(pending); pending.clear();
  for (const n of nodes) { try { walk(n); } catch { /* ignore a bad node */ } }
}
function schedule(node) {
  pending.add(node);
  if (!scheduled) { scheduled = true; (window.requestAnimationFrame || setTimeout)(flush); }
}

// (Re)sync the DOM term observer to the current config. Call whenever the term
// overrides change. Detaches (and does nothing) when there are no renames.
export function syncTermDom() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  if (!hasTermOverrides()) {
    if (observer) { observer.disconnect(); observer = null; }
    return;
  }
  // Initial full pass over the current document.
  try { walk(document.body); } catch { /* */ }
  if (observer) return; // already watching
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') schedule(m.target);
      else if (m.addedNodes) { for (const n of m.addedNodes) schedule(n); }
    }
  });
  try { observer.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch { /* */ }
}
