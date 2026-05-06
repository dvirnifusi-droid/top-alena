import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, CheckCircle, AlertCircle, Loader2, Tablet, CreditCard, X } from 'lucide-react';

export default function GearReturnDialog({ open, onClose, myDevices, employeeId }) {
    const [ipadReturned, setIpadReturned] = useState(false);
    const [terminalReturned, setTerminalReturned] = useState(false);

    const [ipadPhoto, setIpadPhoto] = useState(null);
    const [ipadPhotoPreview, setIpadPhotoPreview] = useState(null);
    const [uploadingIpadPhoto, setUploadingIpadPhoto] = useState(false);

    const [terminalPhoto, setTerminalPhoto] = useState(null);
    const [terminalPhotoPreview, setTerminalPhotoPreview] = useState(null);
    const [uploadingTerminalPhoto, setUploadingTerminalPhoto] = useState(false);

    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const myIpad = myDevices?.ipad;
    const myTerminal = myDevices?.terminal;
    const hasIpad = !!myIpad;
    const hasTerminal = !!myTerminal;

    const ipadDone = !hasIpad || ipadReturned;
    const terminalDone = !hasTerminal || terminalReturned;
    // בודקים preview (הצגה מיידית) ולא רק URL שמגיע אחרי העלאה
    const ipadPhotoDone = !hasIpad || !!ipadPhotoPreview;
    const terminalPhotoDone = !hasTerminal || !!terminalPhotoPreview;
    const isUploading = uploadingIpadPhoto || uploadingTerminalPhoto;
    const noDevices = !hasIpad && !hasTerminal;
    const hasAtLeastOnePhoto = !!ipadPhotoPreview || !!terminalPhotoPreview;
    const canProceed = ipadDone && terminalDone && ipadPhotoDone && terminalPhotoDone && (!noDevices || hasAtLeastOnePhoto) && !isUploading;

    const handlePhotoUpload = async (file, setUrl, setPreview, setUploading) => {
        if (!file) return;
        setUploading(true);
        setPreview(URL.createObjectURL(file));
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            setUrl(file_url);
        } catch (err) {
            console.error('Upload failed', err);
        }
        setUploading(false);
    };

    const handleConfirm = async () => {
        setSaving(true);
        const now = new Date().toISOString();
        const updates = [];

        if (myIpad) {
            updates.push(base44.entities.DeviceAsset.update(myIpad.id, {
                status: 'available',
                current_holder_id: '',
                current_holder_name: '',
                return_photo_url: ipadPhoto || ipadPhotoPreview,
                return_notes: notes,
                returned_at: now,
            }));
        }
        if (myTerminal) {
            updates.push(base44.entities.DeviceAsset.update(myTerminal.id, {
                status: 'available',
                current_holder_id: '',
                current_holder_name: '',
                return_photo_url: terminalPhoto || terminalPhotoPreview,
                return_notes: notes,
                returned_at: now,
            }));
        }

        await Promise.all(updates);
        setSaving(false);
        onClose({ ipadPhoto, terminalPhoto, notes });
    };

    const PhotoUploader = ({ label, icon: Icon, iconColor, preview, uploading, onFile, onClear }) => (
        <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Icon className={`w-4 h-4 ${iconColor}`} />
                {label} <span className="text-red-500">*חובה</span>
            </p>
            {preview ? (
                <div className="relative">
                    <img src={preview} alt={label} className="w-full h-32 object-cover rounded-xl border-2 border-green-400" />
                    {uploading && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                            <Loader2 className="w-7 h-7 text-white animate-spin" />
                        </div>
                    )}
                    {!uploading && (
                        <button onClick={onClear} className="absolute top-2 left-2 bg-white rounded-full p-1 shadow">
                            <X className="w-4 h-4 text-red-500" />
                        </button>
                    )}
                </div>
            ) : (
                <label className="flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 cursor-pointer hover:bg-indigo-100 transition-colors">
                    <Camera className="w-6 h-6 text-indigo-400 mb-1" />
                    <span className="text-xs text-indigo-600 font-medium">לחץ לצילום / העלאה</span>
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => onFile(e.target.files[0])}
                    />
                </label>
            )}
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent dir="rtl" className="max-w-sm w-[95vw] max-h-[90vh] overflow-y-auto" onInteractOutside={e => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        📦 סיום משמרת – החזרת ציוד
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* אייפד */}
                    {hasIpad && (
                        <div className="border rounded-xl p-3 space-y-3 bg-blue-50/40">
                            <div
                                className={`flex items-center gap-3 p-2 rounded-lg border-2 cursor-pointer transition-all ${ipadReturned ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'}`}
                                onClick={() => setIpadReturned(!ipadReturned)}
                            >
                                <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${ipadReturned ? 'border-green-500 bg-green-500' : 'border-slate-400'}`}>
                                    {ipadReturned && <CheckCircle className="w-3 h-3 text-white" />}
                                </div>
                                <Tablet className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                <p className="text-sm font-medium text-slate-700">
                                    החזרתי <strong>אייפד #{myIpad.device_number}</strong> לעמדת הטעינה
                                </p>
                            </div>
                            <PhotoUploader
                                label="צלם אייפד מחובר למטען"
                                icon={Tablet}
                                iconColor="text-blue-500"
                                preview={ipadPhotoPreview}
                                uploading={uploadingIpadPhoto}
                                onFile={f => handlePhotoUpload(f, setIpadPhoto, setIpadPhotoPreview, setUploadingIpadPhoto)}
                                onClear={() => { setIpadPhoto(null); setIpadPhotoPreview(null); }}
                            />
                        </div>
                    )}

                    {/* מסופון */}
                    {hasTerminal && (
                        <div className="border rounded-xl p-3 space-y-3 bg-purple-50/40">
                            <div
                                className={`flex items-center gap-3 p-2 rounded-lg border-2 cursor-pointer transition-all ${terminalReturned ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'}`}
                                onClick={() => setTerminalReturned(!terminalReturned)}
                            >
                                <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${terminalReturned ? 'border-green-500 bg-green-500' : 'border-slate-400'}`}>
                                    {terminalReturned && <CheckCircle className="w-3 h-3 text-white" />}
                                </div>
                                <CreditCard className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                <p className="text-sm font-medium text-slate-700">
                                    החזרתי <strong>מסופון #{myTerminal.device_number}</strong> לעמדת הטעינה
                                </p>
                            </div>
                            <PhotoUploader
                                label="צלם מסופון מחובר למטען"
                                icon={CreditCard}
                                iconColor="text-purple-500"
                                preview={terminalPhotoPreview}
                                uploading={uploadingTerminalPhoto}
                                onFile={f => handlePhotoUpload(f, setTerminalPhoto, setTerminalPhotoPreview, setUploadingTerminalPhoto)}
                                onClear={() => { setTerminalPhoto(null); setTerminalPhotoPreview(null); }}
                            />
                        </div>
                    )}

                    {!hasIpad && !hasTerminal && (
                        <div className="space-y-3">
                            <div className="text-center py-2 text-sm text-slate-500 bg-slate-50 rounded-lg border">
                                לא נרשם ציוד עבורך במשמרת זו
                            </div>
                            <PhotoUploader
                                label="צלם את הציוד שהחזרת"
                                icon={Camera}
                                iconColor="text-indigo-500"
                                preview={ipadPhotoPreview}
                                uploading={uploadingIpadPhoto}
                                onFile={f => handlePhotoUpload(f, setIpadPhoto, setIpadPhotoPreview, setUploadingIpadPhoto)}
                                onClear={() => { setIpadPhoto(null); setIpadPhotoPreview(null); }}
                            />
                        </div>
                    )}

                    {/* הערות */}
                    <div>
                        <p className="text-sm font-medium text-slate-600 mb-1">הערות (אופציונלי) – תקלות, נזק וכו'</p>
                        <Textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="לדוגמה: הסוללה של אייפד #3 לא טענה..."
                            rows={2}
                            className="text-right text-sm"
                        />
                    </div>

                    {/* ולידציה */}
                    {isUploading && (
                        <div className="flex items-center gap-2 text-blue-600 text-xs bg-blue-50 border border-blue-200 rounded-lg p-2">
                            <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                            <span>מעלה תמונה... אנא המתן</span>
                        </div>
                    )}
                    {!canProceed && !isUploading && (
                        <div className="flex items-center gap-2 text-amber-600 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>
                                {!ipadDone ? 'יש לאשר החזרת האייפד' :
                                 !terminalDone ? 'יש לאשר החזרת המסופון' :
                                 !ipadPhotoDone ? 'יש לצלם את האייפד בעמדת הטעינה' :
                                 !terminalPhotoDone ? 'יש לצלם את המסופון בעמדת הטעינה' :
                                 'יש לצלם את הציוד לפני סיום המשמרת'}
                            </span>
                        </div>
                    )}

                    <Button
                        onClick={handleConfirm}
                        disabled={!canProceed || saving}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 text-base font-bold"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : null}
                        ✅ אישור החזרה וסיום משמרת
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}