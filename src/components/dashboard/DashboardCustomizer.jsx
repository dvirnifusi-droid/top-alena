import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings2, GripVertical, Eye, EyeOff } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function DashboardCustomizer({ open, onClose, layout, onSave }) {
  const [localLayout, setLocalLayout] = useState(layout);

  // sync when opened
  React.useEffect(() => {
    setLocalLayout(layout);
  }, [layout, open]);

  const toggle = (id) => {
    setLocalLayout(prev => prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(localLayout);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setLocalLayout(items);
  };

  const handleSave = () => {
    onSave(localLayout);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Settings2 className="w-5 h-5" />
            ערוך דשבורד
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-3">גרור לשינוי סדר • לחץ על העין להסתרה/הצגה</p>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="widgets">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 max-h-[60vh] overflow-y-auto">
                {localLayout.map((widget, index) => (
                  <Draggable key={widget.id} draggableId={widget.id} index={index}>
                    {(prov, snapshot) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.draggableProps}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                          widget.enabled
                            ? 'bg-white border-primary/30 shadow-sm'
                            : 'bg-muted/40 border-muted opacity-60'
                        } ${snapshot.isDragging ? 'shadow-xl scale-105' : ''}`}
                      >
                        <div {...prov.dragHandleProps} className="cursor-grab text-muted-foreground hover:text-foreground">
                          <GripVertical className="w-5 h-5" />
                        </div>
                        <span className="text-xl">{widget.emoji}</span>
                        <span className={`flex-1 text-sm font-medium ${widget.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                          {widget.label}
                        </span>
                        <button
                          onClick={() => toggle(widget.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            widget.enabled
                              ? 'bg-primary/10 text-primary hover:bg-primary/20'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {widget.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSave}
            className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 font-bold hover:opacity-90 transition-opacity"
          >
            שמור שינויים
          </button>
          <button
            onClick={onClose}
            className="px-4 bg-muted text-muted-foreground rounded-xl py-3 font-medium hover:bg-muted/80 transition-colors"
          >
            ביטול
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}