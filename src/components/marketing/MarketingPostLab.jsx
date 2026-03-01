
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InvokeLLM, UploadFile, GenerateImage } from "@/integrations/Core";
import { Zap, Sparkles, Loader2, ThumbsUp, ThumbsDown, Copy, Upload, X, Image as ImageIcon, Download, Brush } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label"; // Added Label component


const ImageGenerator = () => {
    const [prompt, setPrompt] = useState('');
    const [style, setStyle] = useState('photorealistic');
    const [format, setFormat] = useState('post');
    const [customWidth, setCustomWidth] = useState('');
    const [customHeight, setCustomHeight] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState(null);
    const [uploadedFile, setUploadedFile] = useState(null); // New state for uploaded file URL
    const [isUploading, setIsUploading] = useState(false); // New state for upload status


    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // Check file type: only images or PDFs for inspiration
            if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
                alert('אנא העלה קובץ תמונה (JPG, PNG) או PDF בלבד.');
                return;
            }

            const result = await UploadFile({ file });
            setUploadedFile(result.file_url); // Store the URL of the uploaded file
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('שגיאה בהעלאת הקובץ.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveFile = () => {
        setUploadedFile(null); // Clear the uploaded file
    };

    const handleGenerate = async () => {
        if (!prompt) {
            alert('אנא הזן תיאור לתמונה.');
            return;
        }

        if (format === 'custom' && (!customWidth || !customHeight)) {
            alert('אנא הזן גם רוחב וגם גובה עבור גודל מותאם אישית.');
            return;
        }

        setIsGenerating(true);
        setGeneratedImage(null);
        try {
            let formatString = '';
            if (format === 'custom') {
                formatString = `with a custom aspect ratio of ${customWidth}:${customHeight}`;
            } else if (format === 'post') {
                formatString = 'as a square social media post (1:1 aspect ratio)';
            } else if (format === 'story') {
                formatString = 'as a vertical story (9:16 aspect ratio)';
            } else {
                formatString = `for a social media ${format}`; // Default for menu_item, flyer
            }
            
            let finalPrompt = `Generate a ${style} image for a restaurant, designed ${formatString}. The image should depict: ${prompt}.`;

            if (uploadedFile) {
                // If a file is uploaded, use InvokeLLM to enrich the prompt
                const enrichmentPrompt = `
                    You are a creative director for a restaurant. Analyze the user's request and the attached file (which could be a menu, logo, or style example).
                    User's request: "Create an image depicting: ${prompt}"
                    The desired style is ${style} and it should be designed ${formatString}.

                    Based on ALL this information, create a new, single, highly-detailed and visually descriptive prompt for an AI image generator (like DALL-E). This new prompt should combine the user's request with the style, colors, and branding elements from the attached file to create a cohesive and on-brand image. The prompt should be a single paragraph. Output ONLY the new prompt, and nothing else.
                `;

                const enrichedPromptResponse = await InvokeLLM({
                    prompt: enrichmentPrompt,
                    file_urls: [uploadedFile] // Pass the uploaded file URL to LLM
                });
                
                // Assuming the LLM returns an object like { text: "..." } or raw string
                finalPrompt = enrichedPromptResponse.text || enrichedPromptResponse; 
            } else if (prompt.length > 1000) { // New condition for long text without file
                 const summarizationPrompt = `
                    The following text is a long and detailed request for an image, likely containing a full menu. 
                    Your task is to summarize this text into a concise, visually descriptive prompt for an AI image generator like DALL-E. 
                    The prompt should be a single paragraph, under 150 words, capturing the desired atmosphere, key dishes, and overall style.
                    Do not include lists, prices, or technical details. Focus on creating an appealing visual scene.
                    
                    Original Text: "${prompt}"
                    
                    Create the new, short, visual prompt now. Output ONLY the summarized prompt, and nothing else.
                `;
                const summarizedResponse = await InvokeLLM({ prompt: summarizationPrompt });
                // Construct finalPrompt using the summarized text, preserving style and format
                finalPrompt = `Generate a ${style} image for a restaurant, designed ${formatString}. The image should visually represent the essence of: ${summarizedResponse.text || summarizedResponse}`;
            }
            
            const result = await GenerateImage({ prompt: finalPrompt });
            setGeneratedImage(result.url);
        } catch (error) {
            console.error('Error generating image:', error);
            alert('שגיאה ביצירת התמונה, נסה שוב.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownload = () => {
        if (generatedImage) {
            const link = document.createElement('a');
            link.href = generatedImage;
            link.download = `${prompt.substring(0, 20)}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <Card className="shadow-xl bg-gradient-to-br from-rose-50 to-orange-50 border-rose-200">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-rose-800">
                    <Brush className="w-6 h-6" />
                    סטודיו לעיצוב AI
                </CardTitle>
                <CardDescription>צור תמונות מרהיבות לקמפיינים שלך בעזרת בינה מלאכותית.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label className="block text-sm font-medium mb-2">תיאור התמונה הרצויה</Label>
                    <Textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="למשל: המבורגר עסיסי עם צ'יפס על מגש עץ, אווירה של מסעדת דיינר אמריקאית"
                        className="h-24"
                    />
                </div>
                {/* New file upload section */}
                <div>
                    <Label className="block text-sm font-medium mb-2">העלה קובץ כהשראה (לוגו, תפריט, וכו')</Label>
                    {!uploadedFile ? (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                            <input
                                type="file"
                                accept="image/*,application/pdf" // Accept images and PDFs
                                onChange={handleFileUpload}
                                className="hidden"
                                id="design-file-upload"
                                disabled={isUploading}
                            />
                            <label htmlFor="design-file-upload" className={`cursor-pointer ${isUploading ? 'opacity-50' : ''}`}>
                                <div className="space-y-1">
                                    {isUploading ? (
                                        <Loader2 className="w-6 h-6 mx-auto text-gray-400 animate-spin" />
                                    ) : (
                                        <>
                                            <Upload className="w-6 h-6 mx-auto text-gray-400" />
                                            <p className="text-xs text-gray-500">לחץ להעלאת קובץ</p>
                                        </>
                                    )}
                                </div>
                            </label>
                        </div>
                    ) : (
                        <div className="relative p-2 border rounded-lg bg-gray-50 flex items-center justify-between">
                            {uploadedFile.match(/\.(jpeg|jpg|gif|png)$/) != null ? (
                                <img 
                                    src={uploadedFile} 
                                    alt="Uploaded inspiration" 
                                    className="max-h-16 w-auto object-contain mr-2 rounded" 
                                />
                            ) : (
                                <ImageIcon className="w-8 h-8 text-gray-500 mr-2" />
                            )}
                            <p className="text-sm truncate text-gray-700 flex-grow">
                                קובץ הועלה: {uploadedFile.split('/').pop()}
                            </p>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-gray-600 hover:bg-gray-200"
                                onClick={handleRemoveFile}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <Label className="block text-sm font-medium mb-2">סגנון עיצוב</Label>
                        <Select value={style} onValueChange={setStyle}>
                            <SelectTrigger>
                                <SelectValue placeholder="בחר סגנון" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="photorealistic">צילום מציאותי</SelectItem>
                                <SelectItem value="cartoon">איור / קריקטורה</SelectItem>
                                <SelectItem value="watercolor">צבעי מים</SelectItem>
                                <SelectItem value="3d-render">הדמיית תלת מימד</SelectItem>
                                <SelectItem value="minimalist">מינימליסטי</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div>
                        <Label className="block text-sm font-medium mb-2">פורמט</Label>
                        <Select value={format} onValueChange={setFormat}>
                            <SelectTrigger>
                                <SelectValue placeholder="בחר פורמט" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="post">פוסט לרשת חברתית (1:1)</SelectItem>
                                <SelectItem value="story">סטורי (9:16)</SelectItem>
                                <SelectItem value="menu_item">תמונת תפריט</SelectItem>
                                <SelectItem value="flyer">פלייר</SelectItem>
                                <SelectItem value="custom">גודל מותאם אישית</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                {format === 'custom' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="block text-sm font-medium mb-2">רוחב (יחס)</Label>
                            <Input 
                                type="number"
                                placeholder="למשל: 16"
                                value={customWidth}
                                onChange={(e) => setCustomWidth(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label className="block text-sm font-medium mb-2">גובה (יחס)</Label>
                             <Input 
                                type="number"
                                placeholder="למשל: 9"
                                value={customHeight}
                                onChange={(e) => setCustomHeight(e.target.value)}
                            />
                        </div>
                    </div>
                )}
                <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || isUploading} // Disable if uploading
                    className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                    size="lg"
                >
                    {isGenerating ? (
                        <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> יוצר קסם...</>
                    ) : (
                        <><Sparkles className="w-5 h-5 mr-2" /> צור תמונה</>
                    )}
                </Button>

                {isGenerating && <Progress value={undefined} className="w-full" />}
                
                {generatedImage && (
                    <div className="space-y-4 pt-4">
                        <h4 className="font-bold">התמונה שלך מוכנה!</h4>
                        <img src={generatedImage} alt="Generated by AI" className="rounded-lg shadow-md w-full" />
                        <Button onClick={handleDownload} variant="outline" className="w-full">
                            <Download className="w-4 h-4 mr-2" />
                            הורד תמונה
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default function MarketingPostLab() {
    const [reviewInput, setReviewInput] = useState({ 
        post_text: '', 
        image_description: '', 
        goal: '',
        uploaded_image: null
    });
    const [isReviewing, setIsReviewing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [reviewResult, setReviewResult] = useState(null);
    const [copySuccess, setCopySuccess] = useState(false);

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // בדיקה שזה תמונה או וידאו
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            alert('אנא העלה רק קבצי תמונה או וידאו');
            return;
        }

        setIsUploading(true);
        try {
            const result = await UploadFile({ file });
            setReviewInput({
                ...reviewInput,
                uploaded_image: result.file_url
            });
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('שגיאה בהעלאת הקובץ. נסה שוב.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveImage = () => {
        setReviewInput({
            ...reviewInput,
            uploaded_image: null
        });
    };

    const handleGetFeedback = async () => {
        if (!reviewInput.post_text && !reviewInput.uploaded_image) {
            alert('אנא הזן טקסט או העלה תמונה לפחות');
            return;
        }

        setIsReviewing(true);
        setReviewResult(null);

        try {
            const prompt = `
                You are a world-class social media marketing expert for restaurants, specializing in viral content that drives sales.
                Analyze the following social media post draft for a restaurant.

                Post Details:
                - Text: "${reviewInput.post_text || 'אין טקסט'}"
                - Image Description: "${reviewInput.image_description || 'לא סופק תיאור'}"
                - Goal of the post: "${reviewInput.goal || 'לא צוין יעד מספציפי'}"

                Provide feedback in Hebrew. Your response must be a JSON object with the following structure:
                {
                  "overall_score": <An integer between 0 and 100 representing the post's potential for success>,
                  "strengths": [<An array of strings, each highlighting a positive aspect of the post>],
                  "weaknesses": [<An array of strings, each pointing out an area for improvement>],
                  "improved_text": "<A rewritten, improved version of the post text that is engaging, clear, and optimized for the platform>",
                  "hashtag_suggestions": [<An array of 5-7 relevant and trending hashtags in Hebrew>]
                }
            `;

            const fileUrls = reviewInput.uploaded_image ? [reviewInput.uploaded_image] : undefined;

            const aiResponse = await InvokeLLM({
                prompt,
                file_urls: fileUrls,
                response_json_schema: {
                    type: "object",
                    properties: {
                        overall_score: { type: "integer" },
                        strengths: { type: "array", items: { type: "string" } },
                        weaknesses: { type: "array", items: { type: "string" } },
                        improved_text: { type: "string" },
                        hashtag_suggestions: { type: "array", items: { type: "string" } }
                    },
                    required: ["overall_score", "strengths", "weaknesses", "improved_text", "hashtag_suggestions"]
                }
            });

            setReviewResult(aiResponse);

        } catch (error) {
            console.error('Error getting feedback:', error);
            alert('שגיאה בקבלת משוב. נסה שוב.');
        } finally {
            setIsReviewing(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        });
    };

    return (
        <div className="space-y-8">
            <Tabs defaultValue="lab" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="lab">
                        <Zap className="w-4 h-4 mr-2" />
                        מעבדת שיווק
                    </TabsTrigger>
                    <TabsTrigger value="designer">
                         <Brush className="w-4 h-4 mr-2" />
                        סטודיו לעיצוב AI
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="lab" className="mt-6">
                    <Card className="shadow-xl bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-indigo-800">
                                <Zap className="w-6 h-6" />
                                מעבדת שיווק: שפר את הפוסט שלך
                            </CardTitle>
                            <CardDescription>הזן טיוטת פוסט וקבל משוב מיידי מה-AI לפני הפרסום.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">תוכן הפוסט</label>
                                <Textarea
                                    value={reviewInput.post_text}
                                    onChange={(e) => setReviewInput({ ...reviewInput, post_text: e.target.value })}
                                    placeholder="הדבק כאן את הטקסט של הפוסט שלך..."
                                    className="h-28"
                                />
                            </div>

                            {/* העלאת תמונה */}
                            <div>
                                <label className="block text-sm font-medium mb-2">תמונה או וידאו</label>
                                {!reviewInput.uploaded_image ? (
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                                        <input
                                            type="file"
                                            accept="image/*,video/*"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                            id="file-upload"
                                        />
                                        <label htmlFor="file-upload" className="cursor-pointer">
                                            <div className="space-y-2">
                                                {isUploading ? (
                                                    <>
                                                        <Loader2 className="w-10 h-10 mx-auto text-gray-400 animate-spin" />
                                                        <p className="text-gray-500">מעלה קובץ...</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="w-10 h-10 mx-auto text-gray-400" />
                                                        <p className="text-gray-500">לחץ כאן להעלאת תמונה או וידאו</p>
                                                        <p className="text-xs text-gray-400">תמונות: JPG, PNG, GIF | וידאו: MP4, MOV</p>
                                                    </>
                                                )}
                                            </div>
                                        </label>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <img 
                                            src={reviewInput.uploaded_image} 
                                            alt="תמונה שהועלתה" 
                                            className="w-full h-64 object-cover rounded-lg"
                                        />
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="absolute top-2 right-2"
                                            onClick={handleRemoveImage}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">תיאור נוסף של התמונה/סרטון (אופציונלי)</label>
                                    <Input
                                        value={reviewInput.image_description}
                                        onChange={(e) => setReviewInput({ ...reviewInput, image_description: e.target.value })}
                                        placeholder="פרטים נוספים על התמונה..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">מה המטרה של הפוסט?</label>
                                    <Input
                                        value={reviewInput.goal}
                                        onChange={(e) => setReviewInput({ ...reviewInput, goal: e.target.value })}
                                        placeholder="למשל: להגדיל הזמנות, להודיע על מבצע"
                                    />
                                </div>
                            </div>
                            <Button
                                onClick={handleGetFeedback}
                                disabled={isReviewing || isUploading}
                                className="w-full bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600"
                                size="lg"
                            >
                                {isReviewing ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        AI מנתח את הפוסט...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5 mr-2" />
                                        קבל משוב ושיפור
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {isReviewing && (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                        </div>
                    )}

                    {reviewResult && (
                        <Card className="shadow-lg animate-in fade-in-50 slide-in-from-bottom-5 mt-6">
                            <CardHeader>
                                <CardTitle className="text-xl">ניתוח והמלצות AI</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div>
                                    <p className="text-sm font-medium text-center mb-2">ציון פוטנציאל הצלחה</p>
                                    <div className="relative h-10 w-full">
                                        <Progress value={reviewResult.overall_score} className="h-full" />
                                        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white shadow-sm">
                                            {reviewResult.overall_score}/100
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                                        <h4 className="font-bold flex items-center gap-2 text-green-800"><ThumbsUp className="w-5 h-5"/> מה עובד טוב:</h4>
                                        <ul className="list-disc list-inside mt-2 text-green-700 space-y-1">
                                            {reviewResult.strengths.map((item, i) => <li key={`s-${i}`}>{item}</li>)}
                                        </ul>
                                    </div>
                                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                                        <h4 className="font-bold flex items-center gap-2 text-orange-800"><ThumbsDown className="w-5 h-5"/> נקודות לשיפור:</h4>
                                        <ul className="list-disc list-inside mt-2 text-orange-700 space-y-1">
                                            {reviewResult.weaknesses.map((item, i) => <li key={`w-${i}`}>{item}</li>)}
                                        </ul>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-lg font-bold mb-2">הצעה לטקסט משופר:</h4>
                                    <div className="relative p-4 bg-gray-100 rounded-lg">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(reviewResult.improved_text)}
                                            className="absolute top-2 left-2 text-gray-600 hover:bg-gray-200"
                                        >
                                            <Copy className="w-4 h-4 mr-1" />
                                            {copySuccess ? 'הועתק!' : 'העתק'}
                                        </Button>
                                        <p className="text-gray-800 whitespace-pre-wrap">{reviewResult.improved_text}</p>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-lg font-bold mb-2">הצעות להאשטאגים:</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {reviewResult.hashtag_suggestions.map((tag, i) => (
                                            <Badge key={`tag-${i}`} variant="secondary">{tag}</Badge>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
                <TabsContent value="designer" className="mt-6">
                    <ImageGenerator />
                </TabsContent>
            </Tabs>
        </div>
    );
}
