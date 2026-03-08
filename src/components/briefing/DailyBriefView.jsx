import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Star, Zap, Info, ChefHat, GlassWater, Trophy, Users, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

// משפטי סיום אקראיים וכיפיים
const closingLines = [
    "יאללה, בואו ניתן בראש!",
    "שיהיה לנו שירות אגדי!",
    "תנו חיוך, תעשו כסף.",
    "בואו נראה להם מה זה שירות של אלופים.",
    "כל שולחן הוא הזדמנות. נצלו אותה.",
    "היום אנחנו שוברים שיאים. מוכנים?",
    "אנרגיה גבוהה, טיפים גבוהים. קדימה!",
];

export default function DailyBriefView({ brief, employeeId, onReady, employeeName }) {
     // Moved hook to the top level before any conditional returns
     const randomLine = React.useMemo(() => closingLines[Math.floor(Math.random() * closingLines.length)], []);

     if (!brief) {
         return (
             <Card>
                 <CardHeader>
                     <CardTitle>אין תדריך להיום</CardTitle>
                 </CardHeader>
                 <CardContent>
                     <p>לא פורסם תדריך למשמרת זו עדיין.</p>
                 </CardContent>
             </Card>
         );
     }

     const isReady = brief.read_by?.includes(employeeId);

     const handleReadyClick = async () => {
         if(onReady) onReady(brief.id);

         // שלח הודעה לשיח המשמרת
         try {
             const today = format(new Date(), 'yyyy-MM-dd');
             const shiftType = brief.shift_type || 'general';

             await base44.entities.ShiftMessage.create({
                 sender_id: employeeId,
                 sender_name: employeeName || 'עובד',
                 sender_role: 'employee',
                 message: `✅ קראתי את הבריף ואני מוכן/ה למשמרת`,
                 shift_date: today,
                 shift_type: shiftType,
                 message_type: 'announcement'
             });
         } catch (error) {
             console.error('Error sending brief confirmation:', error);
         }
     };

    const Section = ({ icon, title, children }) => (
        <div className="space-y-3">
            <h3 className="font-bold text-lg flex items-center gap-2 mb-2 text-primary border-b pb-2">
                {React.createElement(icon, {className: "w-5 h-5 text-primary/80"})}
                {title}
            </h3>
            <div className="pl-2 space-y-2 text-gray-700">{children}</div>
        </div>
    );

    return (
        <div className="p-0" dir="rtl">
            <CardHeader className="bg-muted p-4 rounded-t-lg text-center border-b">
                <CardTitle className="text-2xl font-bold text-gray-800">
                    תדריך משמרת {brief.shift_type === 'lunch' ? 'צהריים ☀️' : 'ערב 🌙'}
                </CardTitle>
                <CardDescription>
                    {format(new Date(brief.date), 'eeee, d MMMM', { locale: he })} | מנהל/ת: {brief.created_by_name}
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
                {brief.story_of_the_day && 
                    <Section icon={Info} title="סיפור המשמרת">
                        <p className="text-base leading-relaxed bg-blue-50 p-3 rounded-md border border-blue-100">{brief.story_of_the_day}</p>
                    </Section>
                }
                
                <div className="grid md:grid-cols-2 gap-8">
                    {brief.service_focus && <Section icon={Star} title="דגש שירות"><p className="text-base">{brief.service_focus}</p></Section>}
                    {brief.sales_focus && <Section icon={Zap} title="דגש מכירות"><p className="text-base">{brief.sales_focus}</p></Section>}
                    {brief.operational_focus && <Section icon={Edit} title="דגשי תפעול"><p className="text-base">{brief.operational_focus}</p></Section>}
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                    <Section icon={ChefHat} title="חוסרים במטבח">
                        {brief.kitchen_shortages?.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1">
                                {brief.kitchen_shortages.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                        ) : <p className="text-gray-500">אין חוסרים מיוחדים.</p>}
                    </Section>
                    <Section icon={GlassWater} title="חוסרים בבר">
                        {brief.bar_shortages?.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1">
                                {brief.bar_shortages.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                        ) : <p className="text-gray-500">אין חוסרים מיוחדים.</p>}
                    </Section>
                </div>
                
                <div className="grid md:grid-cols-2 gap-8">
                    <Section icon={Trophy} title="יעדי מכירות ושירות">
                        {brief.sales_targets?.length > 0 && brief.sales_targets.map((t, i) => <p key={`sale-${i}`}>🎯 <b>{t.target_description}:</b> {t.bonus_description}</p>)}
                        {brief.service_targets?.length > 0 && brief.service_targets.map((t, i) => <p key={`service-${i}`}>⭐ <b>{t.target_description}</b></p>)}
                        {(!brief.sales_targets || brief.sales_targets.length === 0) && (!brief.service_targets || brief.service_targets.length === 0) &&
                            <p className="text-gray-500">לא הוגדרו יעדים מיוחדים.</p>
                        }
                    </Section>
                    <Section icon={Users} title="איוש ותפקידים">
                        {brief.station_assignments?.length > 0 && brief.station_assignments.map((a, i) => <p key={`station-${i}`}><b>{a.station_name}:</b> {a.employee_name}</p>)}
                        {brief.closing_tasks?.length > 0 && brief.closing_tasks.map((t, i) => <p key={`closing-${i}`}><b>סגירה - {t.task_description}:</b> {t.assigned_to}</p>)}
                         {(!brief.station_assignments || brief.station_assignments.length === 0) && (!brief.closing_tasks || brief.closing_tasks.length === 0) &&
                            <p className="text-gray-500">לא הוגדרו איושים מיוחדים.</p>
                        }
                    </Section>
                </div>
                
                {onReady && (
                    <div className="text-center pt-6 border-t space-y-4">
                        <p className="text-lg italic text-gray-600">"{randomLine}"</p>
                        <Button 
                            size="lg"
                            onClick={handleReadyClick} 
                            disabled={isReady}
                            className={`w-full transition-all duration-300 ${isReady ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
                        >
                            <Check className="w-5 h-5 ml-2"/>
                            {isReady ? 'אישרתי, אני מוכן/ה!' : 'קראתי, אני מוכן/ה למשמרת!'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </div>
    );
}