// App Builder — apply the owner's global term renames to a component's TEXT
// children, passing every non-string child through untouched. Used by shared UI
// primitives (Button, CardTitle, Label, Badge…) so a term the owner renamed in
// the App Builder is reflected on every button/label across the app.
import { applyTermsGlobal } from '@/hooks/useAppConfig';

export function mapTermChildren(children) {
  if (typeof children === 'string') return applyTermsGlobal(children);
  if (Array.isArray(children)) {
    let changed = false;
    const next = children.map((c) => {
      if (typeof c === 'string') { const v = applyTermsGlobal(c); if (v !== c) changed = true; return v; }
      return c;
    });
    return changed ? next : children;
  }
  return children;
}
