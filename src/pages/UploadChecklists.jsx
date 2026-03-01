import React, { useState } from "react";
import { UploadFile, ExtractDataFromUploadedFile } from "@/integrations/Core";
import { Checklist } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  Upload as UploadIcon, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  CheckSquare,
  Download
} from "lucide-react";

export default function UploadChecklists() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(null);
  const [importingData, setImportingData] = useState(false);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setMessage(null);
      setExtractedData(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setMessage(null);
      setExtractedData(null);
    }
  };

  const processFile = async () => {
    if (!file) {
      setMessage({
        type: 'error',
        text: 'אנא בחר קובץ Excel'
      });
      return;
    }

    setUploading(true);
    setProgress(20);

    try {
      // העלת הקובץ
      const { file_url } = await UploadFile({ file });
      setProgress(40);

      // חילוץ הנתונים מהקובץ
      const extractionResult = await ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            checklists: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  category: { type: "string" },
                  frequency: { type: "string" },
                  assigned_role: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item_text: { type: "string" },
                        is_critical: { type: "boolean" },
                        required_action: { type: "string" },
                        order: { type: "integer" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      setProgress(80);

      if (extractionResult.status === 'success') {
        setExtractedData(extractionResult.output);
        setProgress(100);
        setMessage({
          type: 'success',
          text: `נמצאו ${extractionResult.output.checklists?.length || 0} צ'קליסטים בקובץ`
        });
      } else {
        throw new Error(extractionResult.details || 'שגיאה בחילוץ הנתונים');
      }
      
    } catch (error) {
      setMessage({
        type: 'error',
        text: `שגיאה: ${error.message}`
      });
      setProgress(0);
    }

    setUploading(false);
  };

  const importToDatabase = async () => {
    if (!extractedData?.checklists) return;

    setImportingData(true);
    
    try {
      // יבוא הצ'קליסטים למסד הנתונים
      for (const checklistData of extractedData.checklists) {
        await Checklist.create({
          ...checklistData,
          status: "active",
          version: "1.0"
        });
      }

      setMessage({
        type: 'success',
        text: `${extractedData.checklists.length} צ'קליסטים יובאו בהצלחה למערכת!`
      });

    } catch (error) {
      setMessage({
        type: 'error',
        text: `שגיאה ביבוא: ${error.message}`
      });
    }
    
    setImportingData(false);
  };

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-green-50 to-emerald-100" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4 flex items-center justify-center gap-3">
            <CheckSquare className="w-10 h-10 text-green-600" />
            העלאת צ'קליסטים
          </h1>
          <p className="text-gray-600 text-lg">העלה קובץ Excel עם רשימות הבדיקה שלך</p>
        </div>

        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
            {message.type === 'error' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <Card className="shadow-xl border-0">
          <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-t-lg">
            <CardTitle className="text-2xl flex items-center gap-3">
              <FileSpreadsheet className="w-7 h-7" />
              העלה קובץ Excel
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div
              className="border-2 border-dashed border-green-300 rounded-xl p-12 text-center transition-all hover:border-green-400 hover:bg-green-50/50 cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('file-input').click()}
            >
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                <FileSpreadsheet className="w-10 h-10 text-white" />
              </div>
              
              <p className="text-xl font-semibold text-gray-900 mb-2">
                גרור קובץ Excel לכאן או לחץ לבחירה
              </p>
              <p className="text-gray-600 mb-6">
                תומך בקבצי .xlsx, .xls
              </p>
              
              <input
                type="file"
                onChange={handleFileSelect}
                accept=".xlsx,.xls"
                className="hidden"
                id="file-input"
              />
            </div>

            {file && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-900">קובץ נבחר:</p>
                <p className="text-gray-600">{file.name}</p>
              </div>
            )}

            {uploading && (
              <div className="mt-6">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-gray-600 mt-2 text-center">מעבד קובץ...</p>
              </div>
            )}

            <div className="flex gap-4 mt-6">
              <Button 
                onClick={processFile}
                disabled={!file || uploading}
                className="bg-green-600 hover:bg-green-700 flex-1"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    מעבד...
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-4 h-4 mr-2" />
                    עבד קובץ
                  </>
                )}
              </Button>

              {extractedData && (
                <Button
                  onClick={importToDatabase}
                  disabled={importingData}
                  variant="outline"
                  className="flex-1"
                >
                  {importingData ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      מייבא...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      יבא למערכת
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {extractedData?.checklists && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl text-gray-900">תוצאות חילוץ הנתונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {extractedData.checklists.slice(0, 3).map((checklist, index) => (
                  <div key={index} className="p-4 border rounded-lg bg-gray-50">
                    <h3 className="font-bold text-gray-900">{checklist.title}</h3>
                    <p className="text-gray-600 text-sm">{checklist.description}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {checklist.category}
                      </span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        {checklist.frequency}
                      </span>
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                        {checklist.items?.length || 0} סעיפים
                      </span>
                    </div>
                  </div>
                ))}
                {extractedData.checklists.length > 3 && (
                  <p className="text-gray-600 text-center">
                    ועוד {extractedData.checklists.length - 3} צ'קליסטים...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}