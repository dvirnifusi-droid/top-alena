import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { TipReport } from '@/entities/TipReport';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowRight, DollarSign, Clock, Users, Percent } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function TipReportDetailsPage() {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const location = useLocation();
    const reportId = new URLSearchParams(location.search).get('id');

    useEffect(() => {
        if (reportId) {
            TipReport.get(reportId)
                .then(setReport)
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [reportId]);

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    if (!report) {
        return <div className="text-center p-8">לא נמצא דוח.</div>;
    }

    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-6">
                <div>
                    <Button asChild variant="outline">
                        <Link to={createPageUrl('Reports')}>
                            <ArrowRight className="w-4 h-4 ml-2" />
                            חזרה לדוחות
                        </Link>
                    </Button>
                </div>
                
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl">פירוט דוח טיפים</CardTitle>
                        <CardDescription>
                            {format(new Date(report.date), 'eeee, d MMMM yyyy', { locale: he })}
                             • משמרת {report.shift_type === 'dinner' ? 'ערב' : 'צהריים'}
                        </CardDescription>
                    </CardHeader>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <InfoCard title="סה״כ טיפים" value={`₪${report.total_tips_collected?.toLocaleString()}`} icon={DollarSign} />
                    <InfoCard title="חולק לצוות" value={`₪${report.net_tips_for_distribution?.toLocaleString()}`} icon={Users} color="text-green-600" />
                    <InfoCard title="טיפ ממוצע לשעה" value={`₪${report.tip_per_hour?.toFixed(2)}`} icon={Clock} />
                    <InfoCard title="סה״כ הפרשות" value={`₪${((report.runner_deduction || 0) + (report.restaurant_deduction || 0)).toLocaleString()}`} icon={Percent} color="text-orange-600" />
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>פירוט חלוקה לעובדים</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>שם עובד</TableHead>
                                    <TableHead>תפקיד</TableHead>
                                    <TableHead>שעות</TableHead>
                                    <TableHead>ארוחה</TableHead>
                                    <TableHead>השלמה</TableHead>
                                    <TableHead>טיפ נטו</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {report.staff_details?.map((staff, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{staff.employee_name}</TableCell>
                                        <TableCell>{staff.position}</TableCell>
                                        <TableCell>{staff.effective_hours?.toFixed(2)}</TableCell>
                                        <TableCell>₪{staff.meal_cost?.toFixed(2)}</TableCell>
                                        <TableCell className={staff.supplement > 0 ? "text-orange-600 font-bold" : ""}>
                                            ₪{staff.supplement?.toFixed(2)}
                                        </TableCell>
                                        <TableCell className="font-bold text-green-600">₪{staff.final_tip?.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

const InfoCard = ({ title, value, icon: Icon, color = 'text-blue-600' }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className={`w-4 h-4 ${color}`} />
        </CardHeader>
        <CardContent>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
        </CardContent>
    </Card>
);