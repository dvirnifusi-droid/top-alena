
import React, { useState, useEffect } from 'react';
import { TableSession } from '@/entities/TableSession';
import { ServiceStep } from '@/entities/ServiceStep';
import { User } from '@/entities/User';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CheckCircle, Coffee, Lightbulb, Utensils } from 'lucide-react';
import { format } from 'date-fns';
import WaiterAiAssistant from '../components/waiter/WaiterAiAssistant';
import PageHeader from '@/components/shared/PageHeader';

export default function WaiterTablesPage() {
    const [user, setUser] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [steps, setSteps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showNewTableDialog, setShowNewTableDialog] = useState(false);
    const [selectedSession, setSelectedSession] = useState(null);
    const [newTable, setNewTable] = useState({
        table_number: '',
        party_size: 2,
        table_style: 'couple',
        notes: '',
        special_requests: ''
    });

    useEffect(() => {
        loadData();
        // REAL SYNC: More frequent refresh to sync with map
        const interval = setInterval(loadData, 5000); // Every 5 seconds
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            const currentUser = await User.me();
            setUser(currentUser);

            const [sessionsData, stepsData] = await Promise.all([
                TableSession.filter({ waiter_id: currentUser.id, status: 'active' }),
                ServiceStep.list('step_number')
            ]);

            setSessions(sessionsData);
            setSteps(stepsData);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const createNewTable = async () => {
        if (!newTable.table_number || !user) return;

        try {
            const sessionData = {
                table_number: newTable.table_number,
                party_size: parseInt(newTable.party_size),
                table_style: newTable.table_style,
                waiter_id: user.id,
                waiter_name: user.full_name,
                customer_name: newTable.notes ? `לקוח: ${newTable.notes}` : null,
                current_step: 1,
                steps_completed: [],
                session_start: new Date().toISOString(),
                status: 'active',
                notes: newTable.notes,
                special_requests: newTable.special_requests
            };

            const createdSession = await TableSession.create(sessionData);
            console.log('✅ Created table session with ID:', createdSession.id);

            setShowNewTableDialog(false);
            setNewTable({ table_number: '', party_size: 2, table_style: 'couple', notes: '', special_requests: '' });
            
            // Force immediate reload
            await loadData();
            
            alert(`שולחן ${sessionData.table_number} נפתח בהצלחה!`);

        } catch (error) {
            console.error('Error creating table session:', error);
            alert('שגיאה בפתיחת השולחן: ' + error.message);
        }
    };

    const completeStep = async (sessionId, stepNumber) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        try {
            const updatedSteps = [...(session.steps_completed || []), stepNumber];
            const nextStep = stepNumber < 23 ? stepNumber + 1 : 23;

            const updateData = {
                current_step: nextStep,
                steps_completed: updatedSteps
            };

            if (stepNumber === 23) {
                updateData.status = 'completed';
                updateData.session_end = new Date().toISOString();
            }

            await TableSession.update(sessionId, updateData);
            console.log(`✅ Updated step ${stepNumber} for session ${sessionId}`);
            
            // Force immediate reload
            await loadData();

        } catch (error) {
            console.error('Error completing step:', error);
            alert('שגיאה בעדכון השלב: ' + error.message);
        }
    };

    const getStepInfo = (stepNumber) => {
        return steps.find(s => s.step_number === stepNumber) || {};
    };

    const getTableStyleLabel = (style) => {
        const styles = {
            date: 'דייט רומנטי',
            family_with_kids: 'משפחה עם ילדים', 
            business: 'עסקים',
            friends: 'חברים',
            celebration: 'חגיגה',
            couple: 'זוג',
            solo: 'יחיד'
        };
        return styles[style] || style;
    };

    const getProgressPercentage = (session) => {
        return Math.round(((session.steps_completed?.length || 0) / 23) * 100);
    };

    if (loading) return <div className="flex justify-center items-center h-screen">טוען...</div>;

    return (
        <div className="p-4 sm:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <PageHeader
                    title="השולחנות שלי"
                    subtitle="ניהול שולחנות ומעקב שלבי השירות"
                    icon={Utensils}
                    action={(
                    <Dialog open={showNewTableDialog} onOpenChange={setShowNewTableDialog}>
                        <DialogTrigger asChild>
                            <Button className="bg-orange-600 hover:bg-orange-700">
                                <Plus className="w-5 h-5 ml-2" />
                                שולחן חדש
                            </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl">
                            <DialogHeader>
                                <DialogTitle>פתיחת שולחן חדש</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="table_number_input">מספר שולחן</Label>
                                    <Input 
                                        id="table_number_input"
                                        value={newTable.table_number}
                                        onChange={(e) => setNewTable({...newTable, table_number: e.target.value})}
                                        placeholder="למשל: 12"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="party_size_select">מספר אנשים</Label>
                                    <Select value={newTable.party_size.toString()} onValueChange={(value) => setNewTable({...newTable, party_size: parseInt(value)})}>
                                        <SelectTrigger id="party_size_select">
                                            <SelectValue placeholder="בחר מספר אנשים" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {[1,2,3,4,5,6,7,8,9,10].map(num => (
                                                <SelectItem key={num} value={num.toString()}>{num} אנשים</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="table_style_select">סגנון השולחן</Label>
                                    <Select value={newTable.table_style} onValueChange={(value) => setNewTable({...newTable, table_style: value})}>
                                        <SelectTrigger id="table_style_select">
                                            <SelectValue placeholder="בחר סגנון שולחן" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="date">דייט רומנטי</SelectItem>
                                            <SelectItem value="family_with_kids">משפחה עם ילדים</SelectItem>
                                            <SelectItem value="business">פגישת עסקים</SelectItem>
                                            <SelectItem value="friends">חברים</SelectItem>
                                            <SelectItem value="celebration">חגיגה</SelectItem>
                                            <SelectItem value="couple">זוג</SelectItem>
                                            <SelectItem value="solo">יחיד</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="notes_textarea">הערות</Label>
                                    <Textarea 
                                        id="notes_textarea"
                                        value={newTable.notes}
                                        onChange={(e) => setNewTable({...newTable, notes: e.target.value})}
                                        placeholder="הערות על האורחים..."
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="special_requests_textarea">בקשות מיוחדות</Label>
                                    <Textarea 
                                        id="special_requests_textarea"
                                        value={newTable.special_requests}
                                        onChange={(e) => setNewTable({...newTable, special_requests: e.target.value})}
                                        placeholder="בקשות מיוחדות מהמטבח/בר..."
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setShowNewTableDialog(false)}>ביטול</Button>
                                <Button onClick={createNewTable}>פתח שולחן</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    )}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {sessions.map(session => {
                        const currentStepInfo = getStepInfo(session.current_step);
                        const progress = getProgressPercentage(session);

                        return (
                            <Card key={session.id} className="relative">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="flex items-center gap-2">
                                                <span className="text-2xl font-bold text-orange-600">שולחן {session.table_number}</span>
                                                <Badge variant="outline">{session.party_size} אנשים</Badge>
                                            </CardTitle>
                                            <p className="text-sm text-gray-600 mt-1">{getTableStyleLabel(session.table_style)}</p>
                                            <p className="text-xs text-gray-500">התחיל: {format(new Date(session.session_start), 'HH:mm')}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-2xl font-bold text-green-600">{progress}%</div>
                                            <Progress value={progress} className="w-20 mt-1" />
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-[#F4ECD8] rounded-lg border border-[#E8D9B5]">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-6 h-6 bg-[#44512C] text-white rounded-full flex items-center justify-center text-sm font-bold">
                                                    {session.current_step}
                                                </div>
                                                <h4 className="font-semibold text-[#2E3819]">{currentStepInfo.step_name}</h4>
                                            </div>
                                            <p className="text-sm text-[#44512C] mb-3">{currentStepInfo.description}</p>
                                            
                                            {currentStepInfo.tips && (
                                                <div className="space-y-1">
                                                    <p className="text-xs font-semibold text-[#2E3819]">טיפים:</p>
                                                    {currentStepInfo.tips.map((tip, idx) => (
                                                        <p key={idx} className="text-xs text-[#44512C]">• {tip}</p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            <Button 
                                                onClick={() => completeStep(session.id, session.current_step)}
                                                className="flex-1 bg-green-600 hover:bg-green-700"
                                                disabled={session.current_step > 23}
                                            >
                                                <CheckCircle className="w-4 h-4 ml-2" />
                                                סיימתי שלב זה
                                            </Button>
                                            <Button 
                                                variant="outline" 
                                                size="icon"
                                                onClick={() => setSelectedSession(session)}
                                            >
                                                <Lightbulb className="w-4 h-4" />
                                            </Button>
                                        </div>

                                        {session.notes && (
                                            <p className="text-xs text-gray-600 p-2 bg-gray-100 rounded">
                                                <strong>הערות:</strong> {session.notes}
                                            </p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {sessions.length === 0 && (
                    <div className="text-center py-12">
                        <Coffee className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">אין שולחנות פעילים</h3>
                        <p className="text-gray-500 mb-4">התחל עבודה על ידי פתיחת שולחן חדש</p>
                        <Button onClick={() => setShowNewTableDialog(true)} className="bg-orange-600 hover:bg-orange-700">
                            <Plus className="w-5 h-5 ml-2" />
                            פתח שולחן ראשון
                        </Button>
                    </div>
                )}
            </div>

            {selectedSession && (
                <WaiterAiAssistant 
                    session={selectedSession}
                    currentStep={getStepInfo(selectedSession.current_step)}
                    onClose={() => setSelectedSession(null)}
                />
            )}
        </div>
    );
}
