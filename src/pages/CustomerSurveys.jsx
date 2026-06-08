
import React, { useState, useEffect } from 'react';
import { CustomerFeedback } from '@/entities/CustomerFeedback';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, MessageSquare, Loader2, ServerCrash, Phone, Users, Utensils, Award } from 'lucide-react'; // Added Award icon
import { format } from 'date-fns';

const ratingColors = {
    1: 'bg-red-100 text-red-800',
    2: 'bg-red-100 text-red-800',
    3: 'bg-[#F4ECD8] text-yellow-800',
    4: 'bg-green-100 text-green-800',
    5: 'bg-green-100 text-green-800',
};

function FeedbackCard({ feedback }) {
    // Determine if the feedback is positive and has a phone number for potential customer club inclusion
    const isCustomerClubCandidate = feedback.rating > 3 && feedback.customer_phone;

    return (
        <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row justify-between items-start pb-2">
                <div>
                    <CardTitle className="text-lg">{feedback.customer_name || 'לקוח אנונימי'}</CardTitle>
                    <CardDescription>
                        {feedback.visit_date ? format(new Date(feedback.visit_date), 'dd/MM/yyyy') : format(new Date(feedback.created_date), 'dd/MM/yyyy')}
                    </CardDescription>
                </div>
                <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-5 h-5 ${i < feedback.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                    ))}
                </div>
            </CardHeader>
            <CardContent>
                {feedback.comments && <p className="italic text-gray-700">"{feedback.comments}"</p>}
                
                <div className="flex flex-wrap gap-2 mt-4 text-xs">
                     <Badge variant="secondary" className={ratingColors[feedback.rating]}>
                        דירוג כללי: {feedback.rating}/5
                    </Badge>
                    {feedback.food_rating > 0 && <Badge variant="outline">אוכל: {feedback.food_rating}/5</Badge>}
                    {feedback.service_rating > 0 && <Badge variant="outline">שירות: {feedback.service_rating}/5</Badge>}
                </div>
                
                <div className="border-t mt-4 pt-4 text-sm text-gray-600 space-y-2">
                    {feedback.customer_phone && (
                        <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-500" />
                            <span>{feedback.customer_phone}</span>
                        </div>
                    )}
                    {isCustomerClubCandidate && (
                        <div className="flex items-center gap-2 text-[#7A3722] font-semibold">
                            <Award className="w-4 h-4 text-[#A04A2E]" />
                            <span>מועמד/ת למועדון לקוחות</span>
                        </div>
                    )}
                    {feedback.party_size && (
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-500" />
                            <span>{feedback.party_size} סועדים</span>
                        </div>
                    )}
                    {feedback.table_number && (
                        <div className="flex items-center gap-2">
                            <Utensils className="w-4 h-4 text-gray-500" />
                            <span>מקור: ברקוד {feedback.table_number !== 'general' ? `שולחן ${feedback.table_number}` : 'כללי'}</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default function CustomerSurveysPage() {
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        const loadFeedbacks = async () => {
            setLoading(true);
            try {
                const data = await CustomerFeedback.list('-created_date');
                setFeedbacks(data);
            } catch (err) {
                setError('לא ניתן היה לטעון את המשובים.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        loadFeedbacks();
    }, []);

    const filteredFeedbacks = feedbacks.filter(fb => {
        if (filter === 'all') return true;
        if (filter === 'positive') return fb.rating > 3;
        if (filter === 'negative') return fb.rating <= 3;
        return true;
    });

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen" dir="rtl">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-[#A04A2E]" />
                    <p className="mt-4 text-lg">טוען משובים...</p>
                </div>
            </div>
        );
    }
    
    if (error) {
        return (
             <div className="flex justify-center items-center h-screen" dir="rtl">
                <div className="text-center text-red-600">
                    <ServerCrash className="w-12 h-12 mx-auto" />
                    <p className="mt-4 text-lg">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <MessageSquare className="w-8 h-8 text-[#A04A2E]" />
                        סקרי לקוחות
                    </h1>
                    <p className="text-gray-600 mt-2">כל המשובים מהלקוחות שלך במקום אחד.</p>
                </div>
                
                <Tabs value={filter} onValueChange={setFilter} className="mb-6">
                    <TabsList className="grid w-full sm:w-auto sm:grid-cols-3">
                        <TabsTrigger value="all">הכל</TabsTrigger>
                        <TabsTrigger value="positive">משובים חיוביים</TabsTrigger>
                        <TabsTrigger value="negative">משובים שליליים</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredFeedbacks.length > 0 ? (
                        filteredFeedbacks.map(fb => <FeedbackCard key={fb.id} feedback={fb} />)
                    ) : (
                        <div className="col-span-full text-center py-16">
                            <p className="text-gray-500">לא נמצאו משובים התואמים לסינון.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
