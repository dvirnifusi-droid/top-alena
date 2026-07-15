
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InvokeLLM, UploadFile } from "@/integrations/Core";
import { BrainCircuit, Save, Loader2, ThumbsUp, ThumbsDown, Zap, ShieldAlert, Rocket, Palette, ImageUp, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function RestaurantProfilePanel({ profile, onSave }) {
    const [formData, setFormData] = useState({
        restaurant_name: "",
        target_audience: "",
        cuisine_style: "",
        unique_selling_points: [],
        main_competitors: [],
        marketing_budget_monthly: 0,
        current_challenges: "",
        primary_goals: "",
        ai_analysis: null,
        brand_colors: [],
        brand_font: "",
        logo_url: ""
    });
    
    const [uspInput, setUspInput] = useState("");
    const [competitorInput, setCompetitorInput] = useState("");
    const [colorInput, setColorInput] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);

    useEffect(() => {
        if (profile) {
            setFormData({
                restaurant_name: profile.restaurant_name || "",
                target_audience: profile.target_audience || "",
                cuisine_style: profile.cuisine_style || "",
                unique_selling_points: profile.unique_selling_points || [],
                main_competitors: profile.main_competitors || [],
                marketing_budget_monthly: profile.marketing_budget_monthly || 0,
                current_challenges: profile.current_challenges || "",
                primary_goals: profile.primary_goals || "",
                ai_analysis: profile.ai_analysis || null,
                brand_colors: profile.brand_colors || [],
                brand_font: profile.brand_font || "",
                logo_url: profile.logo_url || ""
            });
            try {
                setAnalysisResult(profile.ai_analysis ? JSON.parse(profile.ai_analysis) : null);
            } catch {
                setAnalysisResult(null);
            }
        }
    }, [profile]);


    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(formData);
        } catch (error) {
            console.error("Failed to save profile", error);
            alert("שגיאה בשמירת הפרופיל");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setAnalysisResult(null);
        try {
            const prompt = `
                You are a top-tier restaurant marketing consultant. Analyze the following restaurant profile and provide a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats) and 3 key strategic recommendations.
                The response must be in Hebrew.

                Restaurant Profile:
                - Name: ${formData.restaurant_name}
                - Cuisine: ${formData.cuisine_style}
                - Target Audience: ${formData.target_audience}
                - Unique Selling Points: ${formData.unique_selling_points.join(', ')}
                - Main Competitors: ${formData.main_competitors.join(', ')}
                - Monthly Marketing Budget: ₪${formData.marketing_budget_monthly}
                - Current Challenges: ${formData.current_challenges}
                - Primary Goals: ${formData.primary_goals}

                Restaurant Branding:
                - Logo: ${formData.logo_url ? 'A logo has been provided.' : 'No logo provided.'}
                - Brand Colors: ${formData.brand_colors.join(', ')}
                - Brand Font: ${formData.brand_font}

                Provide the output as a JSON object with the following structure:
                {
                  "swot": {
                    "strengths": ["point 1", "point 2"],
                    "weaknesses": ["point 1", "point 2"],
                    "opportunities": ["point 1", "point 2"],
                    "threats": ["point 1", "point 2"]
                  },
                  "recommendations": [
                    {"title": "Recommendation 1", "description": "Detailed description..."},
                    {"title": "Recommendation 2", "description": "Detailed description..."},
                    {"title": "Recommendation 3", "description": "Detailed description..."}
                  ]
                }
            `;
            
            const result = await InvokeLLM({
                prompt: prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        swot: {
                            type: "object",
                            properties: {
                                strengths: { type: "array", items: { type: "string" } },
                                weaknesses: { type: "array", items: { type: "string" } },
                                opportunities: { type: "array", items: { type: "string" } },
                                threats: { type: "array", items: { type: "string" } }
                            }
                        },
                        recommendations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

            setAnalysisResult(result);
            // Save the analysis to the profile
            const updatedFormData = { ...formData, ai_analysis: JSON.stringify(result) };
            setFormData(updatedFormData);
            await onSave(updatedFormData);

        } catch (error) {
            console.error("Failed to analyze profile", error);
            alert("שגיאה בניתוח הפרופיל");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleLogoUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsUploadingLogo(true);
        try {
            const result = await UploadFile({ file });
            setFormData({ ...formData, logo_url: result.file_url });
        } catch (error) {
            console.error('Error uploading logo:', error);
            alert('שגיאה בהעלאת הלוגו.');
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const handleRemoveLogo = () => {
        setFormData({ ...formData, logo_url: null });
    };

    const handleArrayInputChange = (e, setter, field, valueArray) => {
        if (e.key === 'Enter' && e.target.value.trim() !== '') {
            e.preventDefault();
            setFormData({ ...formData, [field]: [...valueArray, e.target.value.trim()] });
            setter('');
        }
    };
    
    const removeFromArray = (index, field, valueArray) => {
        const newArray = [...valueArray];
        newArray.splice(index, 1);
        setFormData({ ...formData, [field]: newArray });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form Card */}
            <Card className="shadow-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                        <Rocket className="w-6 h-6 text-rose-500" />
                        פרופיל המסעדה
                    </CardTitle>
                    <CardDescription>מלא את פרטי המסעדה כדי שה-AI יוכל לתת לך המלצות מותאמות אישית.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="restaurant_name">שם המסעדה</Label>
                        <Input id="restaurant_name" value={formData.restaurant_name} onChange={e => setFormData({ ...formData, restaurant_name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="cuisine_style">סגנון מטבח</Label>
                        <Input id="cuisine_style" value={formData.cuisine_style} onChange={e => setFormData({ ...formData, cuisine_style: e.target.value })} placeholder="למשל: איטלקי, בשרים, אסייתי" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="target_audience">קהל יעד</Label>
                        <Input id="target_audience" value={formData.target_audience} onChange={e => setFormData({ ...formData, target_audience: e.target.value })} placeholder="למשל: משפחות, זוגות, עסקי" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="usp">נקודות מכירה ייחודיות (הוסף עם Enter)</Label>
                        <Input id="usp" value={uspInput} onChange={e => setUspInput(e.target.value)} onKeyDown={e => handleArrayInputChange(e, setUspInput, 'unique_selling_points', formData.unique_selling_points)} placeholder="למשל: נוף לים, קוקטיילים מיוחדים" />
                        <div className="flex flex-wrap gap-2">
                            {formData.unique_selling_points.map((item, index) => (
                                <Badge key={index} variant="secondary">{item} <button type="button" onClick={() => removeFromArray(index, 'unique_selling_points', formData.unique_selling_points)} className="mr-1 font-bold">x</button></Badge>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="competitors">מתחרים עיקריים (הוסף עם Enter)</Label>
                        <Input id="competitors" value={competitorInput} onChange={e => setCompetitorInput(e.target.value)} onKeyDown={e => handleArrayInputChange(e, setCompetitorInput, 'main_competitors', formData.main_competitors)} placeholder="שמות של מסעדות מתחרות" />
                        <div className="flex flex-wrap gap-2">
                            {formData.main_competitors.map((item, index) => (
                                <Badge key={index} variant="secondary">{item} <button type="button" onClick={() => removeFromArray(index, 'main_competitors', formData.main_competitors)} className="mr-1 font-bold">x</button></Badge>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="budget">תקציב שיווק חודשי (₪)</Label>
                        <Input id="budget" type="number" value={formData.marketing_budget_monthly} onChange={e => setFormData({ ...formData, marketing_budget_monthly: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="challenges">אתגרים נוכחיים</Label>
                        <Textarea id="challenges" value={formData.current_challenges} onChange={e => setFormData({ ...formData, current_challenges: e.target.value })} placeholder="למשל: תחרות גבוהה בצהריים" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="goals">מטרות עיקריות</Label>
                        <Textarea id="goals" value={formData.primary_goals} onChange={e => setFormData({ ...formData, primary_goals: e.target.value })} placeholder="למשל: להגדיל מכירות סופש ב-20 אחוז" />
                    </div>

                    <Separator className="my-6" />

                    <div className="space-y-4">
                        <h3 className="text-lg font-medium flex items-center gap-2"><Palette className="w-5 h-5 text-rose-500" /> מיתוג העסק</h3>
                        <div className="space-y-2">
                            <Label htmlFor="logo">לוגו</Label>
                            {formData.logo_url ? (
                                <div className="relative p-2 border rounded-lg bg-gray-50 flex items-center justify-between">
                                    <img src={formData.logo_url} alt="Restaurant Logo" className="max-h-16 w-auto object-contain mr-2 rounded" />
                                    <Button size="sm" variant="ghost" className="text-gray-600 hover:bg-gray-200" onClick={handleRemoveLogo}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" id="logo-upload" disabled={isUploadingLogo} />
                                    <label htmlFor="logo-upload" className={`cursor-pointer ${isUploadingLogo ? 'opacity-50' : ''}`}>
                                        <div className="space-y-1">
                                            {isUploadingLogo ? <Loader2 className="w-6 h-6 mx-auto text-gray-400 animate-spin" /> : <ImageUp className="w-6 h-6 mx-auto text-gray-400" />}
                                            <p className="text-xs text-gray-500">לחץ להעלאת לוגו</p>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="brand_font">פונט המותג</Label>
                            <Input id="brand_font" value={formData.brand_font} onChange={e => setFormData({ ...formData, brand_font: e.target.value })} placeholder="למשל: Heebo, Rubik" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="brand_colors">צבעי המותג (הוסף עם Enter)</Label>
                            <Input id="brand_colors" value={colorInput} onChange={e => setColorInput(e.target.value)} onKeyDown={e => handleArrayInputChange(e, setColorInput, 'brand_colors', formData.brand_colors)} placeholder="הכנס קוד צבע, למשל #A45B89" />
                            <div className="flex flex-wrap gap-2">
                                {formData.brand_colors.map((color, index) => (
                                    <Badge key={index} className="flex items-center gap-2">
                                        <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: color }}></span>
                                        {color}
                                        <button type="button" onClick={() => removeFromArray(index, 'brand_colors', formData.brand_colors)} className="mr-1 font-bold">x</button>
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>


                    <div className="flex gap-4 pt-4">
                        <Button onClick={handleSave} disabled={isSaving || isAnalyzing || isUploadingLogo} className="w-full">
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span className="mr-2">שמור פרופיל</span>
                        </Button>
                        <Button onClick={handleAnalyze} disabled={isSaving || isAnalyzing || isUploadingLogo || !profile?.id} variant="outline" className="w-full">
                            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                            <span className="mr-2">נתח עם AI</span>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Analysis Card */}
            <Card className="shadow-xl bg-gradient-to-br from-indigo-50 to-purple-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl text-indigo-800">
                        <BrainCircuit className="w-6 h-6" />
                        ניתוח AI אסטרטגי
                    </CardTitle>
                    <CardDescription>
                        {isAnalyzing ? "ה-AI מנתח את נתוני המסעדה שלך..." : analysisResult ? "ניתוח והמלצות מבוססי AI על סמך הפרופיל שהזנת." : "לאחר שתשמור ותנתח את הפרופיל, תראה כאן את ניתוח ה-SWOT וההמלצות."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isAnalyzing && (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                        </div>
                    )}
                    {analysisResult && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-xl font-bold mb-4">ניתוח SWOT</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Strengths */}
                                    <div className="p-4 bg-green-100 rounded-lg">
                                        <h4 className="font-bold flex items-center gap-2 text-green-800"><ThumbsUp className="w-5 h-5"/> חוזקות</h4>
                                        <ul className="list-disc list-inside mt-2 text-green-700">
                                            {(analysisResult?.swot?.strengths || []).map((item, i) => <li key={`s-${i}`}>{item}</li>)}
                                        </ul>
                                    </div>
                                    {/* Weaknesses */}
                                    <div className="p-4 bg-red-100 rounded-lg">
                                        <h4 className="font-bold flex items-center gap-2 text-red-800"><ThumbsDown className="w-5 h-5"/> חולשות</h4>
                                        <ul className="list-disc list-inside mt-2 text-red-700">
                                            {analysisResult.swot.weaknesses.map((item, i) => <li key={`w-${i}`}>{item}</li>)}
                                        </ul>
                                    </div>
                                    {/* Opportunities */}
                                    <div className="p-4 bg-blue-100 rounded-lg">
                                        <h4 className="font-bold flex items-center gap-2 text-blue-800"><Zap className="w-5 h-5"/> הזדמנויות</h4>
                                        <ul className="list-disc list-inside mt-2 text-blue-700">
                                            {analysisResult.swot.opportunities.map((item, i) => <li key={`o-${i}`}>{item}</li>)}
                                        </ul>
                                    </div>
                                    {/* Threats */}
                                    <div className="p-4 bg-yellow-100 rounded-lg">
                                        <h4 className="font-bold flex items-center gap-2 text-yellow-800"><ShieldAlert className="w-5 h-5"/> איומים</h4>
                                        <ul className="list-disc list-inside mt-2 text-yellow-700">
                                            {analysisResult.swot.threats.map((item, i) => <li key={`t-${i}`}>{item}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                             <div>
                                <h3 className="text-xl font-bold mb-4">המלצות אסטרטגיות</h3>
                                <div className="space-y-4">
                                {analysisResult.recommendations.map((rec, i) => (
                                    <div key={`rec-${i}`} className="p-4 border-l-4 border-indigo-500 bg-white rounded-r-lg">
                                        <h4 className="font-bold text-indigo-900">{rec.title}</h4>
                                        <p className="text-gray-700 mt-1">{rec.description}</p>
                                    </div>
                                ))}
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
