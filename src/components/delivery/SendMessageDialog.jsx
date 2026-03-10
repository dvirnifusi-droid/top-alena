import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { sendDeliveryMessage } from "@/functions/sendDeliveryMessage";
import { Mail, MessageSquare, Phone } from "lucide-react";

const CHANNELS = [
  { id: "email", label: "📧 אימייל", icon: Mail },
  { id: "sms", label: "📱 SMS", icon: MessageSquare },
  { id: "whatsapp", label: "💬 וואטספ", icon: Phone },
];

export default function SendMessageDialog({ customer, allCustomers, onClose }) {
  const [channel, setChannel] = useState("sms");
  const [toAll, setToAll] = useState(!customer);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const recipients = toAll ? allCustomers : (customer ? [customer] : []);

  const handleSend = async () => {
    if (!message.trim()) return alert("נא להזין הודעה");
    setSending(true);
    setResult(null);

    const recipientList = recipients.map((c) => ({
      name: c.customer_name || "",
      phone: c.customer_phone || "",
      email: c.email || "",
    }));

    if (channel === "email") {
      let sent = 0, skipped = 0;
      for (const r of recipientList) {
        if (!r.email) { skipped++; continue; }
        await base44.integrations.Core.SendEmail({
          to: r.email,
          subject: subject || "הודעה ממסעדה",
          body: message,
        });
        sent++;
      }
      setResult({ sent, skipped, total: recipientList.length });
    } else {
      const res = await sendDeliveryMessage({ channel, recipients: recipientList, message });
      const data = res.data;
      const sent = data.results?.filter((r) => r.status === "sent").length || 0;
      const skipped = data.results?.filter((r) => r.status === "skipped").length || 0;
      setResult({ sent, skipped, total: recipientList.length, errors: data.results?.filter((r) => r.status === "failed") });
    }
    setSending(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>📣 שליחת הודעה</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-center py-4">
            <div className="text-4xl">✅</div>
            <div className="font-bold text-lg">נשלח!</div>
            <div className="text-sm text-muted-foreground">
              <div>נשלח ל-{result.sent} נמענים</div>
              {result.skipped > 0 && <div className="text-orange-600">דולגו {result.skipped} (חסר פרטי קשר)</div>}
            </div>
            <Button onClick={onClose} className="w-full">סגור</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ערוץ */}
            <div>
              <Label>ערוץ שליחה</Label>
              <div className="flex gap-2 mt-1">
                {CHANNELS.map((c) => (
                  <button key={c.id} onClick={() => setChannel(c.id)}
                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${channel === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* נמענים */}
            <div>
              <Label>נמענים</Label>
              <div className="flex gap-2 mt-1">
                {customer && (
                  <button onClick={() => setToAll(false)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${!toAll ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>
                    {customer.customer_name || customer.customer_phone}
                  </button>
                )}
                <button onClick={() => setToAll(true)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${toAll ? "bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>
                  כל הלקוחות ({allCustomers.length})
                </button>
              </div>
            </div>

            {channel === "email" && (
              <div><Label>נושא המייל</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="נושא..." /></div>
            )}

            <div>
              <Label>תוכן ההודעה</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="כתוב את ההודעה כאן..." rows={4} />
              <p className="text-xs text-muted-foreground mt-1">{message.length} תווים</p>
            </div>

            <div className="bg-muted rounded-lg p-2 text-xs text-muted-foreground">
              {channel === "email" && `יישלח לנמענים בעלי כתובת אימייל (${recipients.filter(r=>r.email).length} מתוך ${recipients.length})`}
              {channel === "sms" && `יישלח SMS ל-${recipients.length} נמענים`}
              {channel === "whatsapp" && `יישלח וואטספ ל-${recipients.length} נמענים`}
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSend} disabled={sending}>
                {sending ? "שולח..." : `שלח (${toAll ? allCustomers.length : 1})`}
              </Button>
              <Button variant="outline" onClick={onClose}>ביטול</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}