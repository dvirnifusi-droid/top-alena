import React, { useState, useCallback } from 'react';
import { getDriveImages } from '@/functions/getDriveImages';
import { getDriveImageUrl } from '@/functions/getDriveImageUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, FolderOpen, ChevronRight, Check, HardDrive } from 'lucide-react';
import { toast } from 'sonner';

export default function DriveImagePicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState('root');
  const [folderPath, setFolderPath] = useState([{ id: 'root', name: 'My Drive' }]);
  const [images, setImages] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [folderInput, setFolderInput] = useState('');

  const loadFolder = useCallback(async (id, name) => {
    setLoading(true);
    setImages([]);
    setFolders([]);
    try {
      const res = await getDriveImages({ folder_id: id });
      setImages(res.data.images || []);
      setFolders(res.data.folders || []);
      setFolderId(id);
    } catch (e) {
      toast.error('שגיאה בטעינת תמונות מ-Drive');
    }
    setLoading(false);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    loadFolder('root', 'My Drive');
    setFolderPath([{ id: 'root', name: 'My Drive' }]);
  };

  const handleFolderClick = (folder) => {
    setFolderPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    loadFolder(folder.id, folder.name);
  };

  const handleBreadcrumb = (index) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    loadFolder(newPath[newPath.length - 1].id, newPath[newPath.length - 1].name);
  };

  const handleLoadByInput = () => {
    if (!folderInput.trim()) return;
    // Support both folder ID and Drive URL
    let id = folderInput.trim();
    const match = id.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match) id = match[1];
    setFolderPath([{ id: 'root', name: 'My Drive' }, { id, name: 'תיקייה מותאמת' }]);
    loadFolder(id, 'תיקייה מותאמת');
  };

  const handleSelect = async () => {
    if (!selectedId) return;
    setImporting(true);
    try {
      const res = await getDriveImageUrl({ file_id: selectedId });
      if (res.data.url) {
        onSelect(res.data.url);
        setOpen(false);
        setSelectedId(null);
        toast.success('תמונה יובאה בהצלחה!');
      } else {
        toast.error('שגיאה בייבוא התמונה');
      }
    } catch (e) {
      toast.error('שגיאה בייבוא התמונה');
    }
    setImporting(false);
  };

  return (
    <>
      <Button onClick={handleOpen} variant="outline" size="sm" className="gap-1.5">
        <HardDrive className="w-3.5 h-3.5" />
        בחר מ-Drive
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-blue-500" />
              בחר תמונה מ-Google Drive
            </DialogTitle>
          </DialogHeader>

          {/* Folder input */}
          <div className="flex gap-2">
            <Input
              value={folderInput}
              onChange={e => setFolderInput(e.target.value)}
              placeholder="הדבק קישור לתיקייה או ID..."
              dir="ltr"
              className="text-sm"
            />
            <Button size="sm" onClick={handleLoadByInput} variant="outline">טען</Button>
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 flex-wrap text-sm">
            {folderPath.map((crumb, i) => (
              <React.Fragment key={crumb.id}>
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                <button
                  onClick={() => handleBreadcrumb(i)}
                  className={`hover:underline ${i === folderPath.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="overflow-y-auto flex-1 space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Subfolders */}
                {folders.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {folders.map(f => (
                      <button
                        key={f.id}
                        onClick={() => handleFolderClick(f)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border hover:bg-muted text-sm"
                      >
                        <FolderOpen className="w-4 h-4 text-yellow-500" />
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Images grid */}
                {images.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {images.map(img => (
                      <button
                        key={img.id}
                        onClick={() => setSelectedId(img.id === selectedId ? null : img.id)}
                        className={`relative rounded-lg overflow-hidden border-2 aspect-square transition-all ${
                          selectedId === img.id ? 'border-pink-500 ring-2 ring-pink-300' : 'border-transparent hover:border-muted-foreground'
                        }`}
                      >
                        <img
                          src={img.thumbnailLink?.replace('=s220', '=s400') || ''}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                        {selectedId === img.id && (
                          <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                            <Check className="w-6 h-6 text-pink-600 bg-white rounded-full p-0.5" />
                          </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-xs p-1 truncate">
                          {img.name}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  !loading && <p className="text-center text-muted-foreground text-sm py-8">אין תמונות בתיקייה זו</p>
                )}
              </>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button
              onClick={handleSelect}
              disabled={!selectedId || importing}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
            >
              {importing ? <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> מייבא...</> : 'בחר תמונה'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}