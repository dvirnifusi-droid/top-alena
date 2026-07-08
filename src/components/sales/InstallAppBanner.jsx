import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { X } from 'lucide-react';

const DISMISS_KEY = 'install_app_dismissed_until';

export default function InstallAppBanner() {
    const brandName = useTenantBranding()?.name || 'המסעדה';
    const [promptEvent, setPromptEvent] = useState(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (Date.now() < dismissedUntil) return;
        const handler = (e) => {
            e.preventDefault();
            setPromptEvent(e);
            setShow(true);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const install = async () => {
        if (!promptEvent) return;
        promptEvent.prompt();
        await promptEvent.userChoice;
        setShow(false);
    };

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
        setShow(false);
    };

    if (!show) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[60] bg-white border-2 border-blue-300 rounded-2xl shadow-2xl p-3 max-w-xs" dir="rtl">
            <div className="flex items-start gap-2">
                <span className="text-2xl">📲</span>
                <div className="flex-1">
                    <p className="text-sm font-bold">התקן את {brandName} במסך הבית</p>
                    <p className="text-xs text-gray-500 mt-1">קיצור דרך עם הקלטה מהירה ועוד</p>
                    <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={install}>התקן</Button>
                        <Button size="sm" variant="ghost" onClick={dismiss}>אחר כך</Button>
                    </div>
                </div>
                <Button size="sm" variant="ghost" onClick={dismiss}><X className="w-4 h-4" /></Button>
            </div>
        </div>
    );
}
