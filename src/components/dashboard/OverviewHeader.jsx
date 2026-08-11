import React, { useEffect, useState } from 'react';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useOwnerInsights } from '@/hooks/useOwnerInsights';
import { Loader2 } from 'lucide-react';
import { AlertBar, PageHead, MetricCards, MiniBars, HeadControl } from '@/components/shell/PageShell';
import { ils } from '@/components/shell/tokens';

// The dashboard's use of the page shell: one banner for the top issue, the
// headline numbers, and a trend — each only when there is real data behind it.
export default function OverviewHeader() {
  const { data: ins, loading } = useOwnerInsights();
  const [ops, setOps] = useState(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await base44.functions.getOperationsHQ();
        if (!dead) setOps((r?.data ?? r) || { actions: [] });
      } catch {
        if (!dead) setOps({ actions: [] });
      }
    })();
    return () => { dead = true; };
  }, []);

  if (loading && !ops) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;
  }

  const top = (ops?.actions || [])[0] || null;
  const trends = ins?._trends || {};

  const cards = [
    ins?.cashflow?.net != null && {
      k: 'תזרים שבועי', v: ils(ins.cashflow.net), to: createPageUrl('CashFlow'),
      sub: ins.cashflow.unpaid_no_date ? `${ils(ins.cashflow.unpaid_no_date)} ללא תאריך` : null,
      tone: Number(ins.cashflow.net) < 0 ? 'bad' : 'good',
    },
    ins?.labor?.pct != null && {
      k: 'עלות שכר', v: `${ins.labor.pct}%`, to: createPageUrl('LaborCost'),
      sub: ins.labor.flags ? `${ins.labor.flags} חריגות` : ils(ins.labor.cost),
      tone: ins.labor.pct > 32 ? 'bad' : 'good',
    },
    ins?.menu?.avg_food_cost_pct != null && {
      k: 'פוד-קוסט', v: `${ins.menu.avg_food_cost_pct}%`, to: createPageUrl('Recipes'),
      sub: ins.menu.high_cost_count ? `${ins.menu.high_cost_count} מנות גבוהות` : null,
      tone: ins.menu.avg_food_cost_pct > 35 ? 'bad' : 'good',
    },
    ins?.price_drift?.count > 0 && {
      k: 'ייקורי ספקים', v: String(ins.price_drift.count), to: createPageUrl('Recipes'),
      sub: ins.price_drift.top ? `${ins.price_drift.top.product} +${ins.price_drift.top.drift_pct}%` : null,
      tone: 'bad',
    },
    ins?.churn?.count > 0 && {
      k: 'לקוחות בסיכון', v: String(ins.churn.count), to: createPageUrl('CustomerClub'),
      sub: ins.churn.critical ? `${ins.churn.critical} קריטיים` : null, tone: 'bad',
    },
  ].filter(Boolean);

  // Chart whichever metric actually has the longest recorded history. With no
  // series worth drawing, MiniBars renders nothing and the page has no chart.
  const chart = [
    { key: 'labor_pct', label: 'עלות שכר יומית', unit: '%' },
    { key: 'food_cost_pct', label: 'פוד-קוסט יומי', unit: '%' },
    { key: 'cashflow_net', label: 'תזרים יומי', unit: '₪' },
  ].map((c) => ({ ...c, series: trends[c.key]?.series }))
    // A metric that never moved has no trend to show — prefer one that did,
    // otherwise the dashboard renders no chart at all, which is correct.
    .filter((c) => c.series?.length >= 2 && Math.min(...c.series) !== Math.max(...c.series))
    .sort((a, b) => b.series.length - a.series.length)[0];

  if (!cards.length && !top) return null;

  return (
    <div className="mb-2">
      {top && (
        <AlertBar
          tone={top.severity === 'high' ? 'bad' : 'warn'}
          title={top.title}
          detail={top.why}
          action="טפל"
          to={top.link?.startsWith('/') ? top.link : createPageUrl(top.link || 'Dashboard')}
        />
      )}

      <PageHead title="סקירה">
        {ops?.actions?.length > 0 && (
          <HeadControl>{ops.actions.length} דורשים תשומת לב</HeadControl>
        )}
      </PageHead>

      <MetricCards items={cards} />
      {chart && <MiniBars label={chart.label} series={chart.series} unit={chart.unit} />}
    </div>
  );
}
