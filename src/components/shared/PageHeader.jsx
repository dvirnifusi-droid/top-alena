import React from 'react';

// Shared page shell + header so every page opens the same way: warm gradient
// canvas, centered max-width column, and one editorial header treatment
// (icon tile + serif title + subtitle + optional action). Migrating pages onto
// these two primitives is what makes the whole app read as one visual language.

export function PageShell({ children, className = '' }) {
    return (
        <div className={`min-h-screen bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] p-4 sm:p-6 ${className}`} dir="rtl">
            <div className="max-w-7xl mx-auto">{children}</div>
        </div>
    );
}

export default function PageHeader({ title, subtitle, icon: Icon, action, accent = 'var(--brand-primary, #A04A2E)' }) {
    // Mobile: stack title above actions (side-by-side squeezes the text column
    // to ~1ch when the action block is wide — letters render vertically).
    return (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 min-w-0">
                {Icon && (
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: accent }}>
                        <Icon className="w-6 h-6 text-white" strokeWidth={2.2} />
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="font-display text-3xl sm:text-4xl font-black text-[#2A2018] leading-none truncate">{title}</h1>
                    {subtitle && <p className="text-[#8A7C64] text-sm mt-1.5">{subtitle}</p>}
                </div>
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
        </div>
    );
}
