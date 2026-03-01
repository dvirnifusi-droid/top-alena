
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Upload, Loader2, CheckCircle, AlertCircle, Utensils } from 'lucide-react';
import { UploadFile, ExtractDataFromUploadedFile } from '@/integrations/Core'; // Changed UploadPrivateFile to UploadFile
import { Employee } from '@/entities/Employee';

export default function EmployeeMealScanner({ onMealsExtracted }) {
    const [file, setFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState(null);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
        setResult(null);
    };

    const handleScan = async () => {
        if (!file) return;

        setIsLoading(true);
        setResult(null);

        try {
            const { file_url } = await UploadFile({ file }); // Changed UploadPrivateFile to UploadFile and file_uri to file_url

            const extractionResult = await ExtractDataFromUploadedFile({
                file_url: file_url, // Ensured file_url is passed
                json_schema: {
                    type: "object",
                    properties: {
                        meals: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    item_name: { type: "string" },
                                    notes: { type: "string", description: "Any notes associated with the meal item, potentially containing the employee's name." },
                                    price: { type: "number" }
                                },
                                required: ["item_name", "price"]
                            }
                        }
                    },
                    required: ["meals"]
                }
            });

            if (extractionResult.status !== 'success' || !extractionResult.output?.meals) {
                throw new Error(extractionResult.details || "Failed to extract meals from the document.");
            }

            const allEmployees = await Employee.list();
            
            // שיפור: נסה למצוא שם עובד בהערות
            const processedMeals = extractionResult.output.meals.map(meal => {
                let employeeName = '';
                if (meal.notes) {
                    const notesLower = meal.notes.toLowerCase();
                    const foundEmployee = allEmployees.find(emp => {
                        const nameParts = emp.full_name.toLowerCase().split(' ');
                        // Check if any part of the employee's name is in the notes
                        return nameParts.some(part => notesLower.includes(part));
                    });
                    if (foundEmployee) {
                        employeeName = foundEmployee.full_name;
                    }
                }
                return { ...meal, employee_name: employeeName };
            });

            onMealsExtracted(processedMeals);
            setResult({ type: 'success', message: `נמצאו ${processedMeals.length} ארוחות עובדים!` });
            setFile(null);

        } catch (err) {
            console.error(err);
            setResult({ type: 'error', message: err.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="shadow-md">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <Utensils className="w-5 h-5 text-indigo-500" />
                    <CardTitle className="text-lg">סריקת ארוחות עובדים</CardTitle>
                </div>
                <CardDescription>העלה צילום של חשבון המפרט את ארוחות העובדים</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Input id="meal-file" type="file" accept="image/*,application/pdf" onChange={handleFileChange} />
                
                <Button onClick={handleScan} disabled={isLoading || !file} className="w-full">
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            סורק...
                        </>
                    ) : (
                         <>
                            <Upload className="w-4 h-4 mr-2" />
                            סרוק ארוחות
                        </>
                    )}
                </Button>

                {result && (
                    <Alert variant={result.type === 'error' ? 'destructive' : 'default'}>
                        {result.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                        <AlertTitle>{result.type === 'success' ? 'הצלחה!' : 'שגיאה'}</AlertTitle>
                        <AlertDescription>{result.message}</AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
}
