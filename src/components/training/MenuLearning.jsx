import React, { useState, useEffect } from 'react';
import { MenuItem } from '@/entities/MenuItem';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from '@/api/base44Client';
import { 
    Search, Clock, DollarSign, AlertTriangle, ChefHat, Trash2, Pencil,
    Flame, Sparkles, Beef, Utensils, Leaf, CakeSlice, Martini, Image, X, Loader2 as Loader, Settings, Plus
} from 'lucide-react';

function CategoryRenameInline({ catName, onRename, disabled }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(catName);

    const handleSave = () => {
        onRename(catName, value);
        setEditing(false);
    };

    if (editing) {
        return (
            <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    className="border rounded px-1 py-0.5 text-sm w-28"
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                />
                <button onClick={handleSave} disabled={disabled} className="text-green-600 text-xs font-bold">✓</button>
                <button onClick={() => setEditing(false)} className="text-red-500 text-xs font-bold">✕</button>
            </span>
        );
    }

    return (
        <span className="flex items-center gap-1">
            <span>{catName}</span>
            <button onClick={e => { e.stopPropagation(); setEditing(true); }} className="opacity-50 hover:opacity-100">
                <Pencil className="w-3 h-3" />
            </button>
        </span>
    );
}

export default function MenuLearning({ onComplete, user }) {
    const [menuItems, setMenuItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [viewedItems, setViewedItems] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    useEffect(() => {
        loadMenu();
    }, []);

    const loadMenu = async () => {
        try {
            const items = await MenuItem.list();
            setMenuItems(items);
        } catch (error) {
            console.error('שגיאה בטעינת התפריט:', error);
        }
        setLoading(false);
    };

    const handleItemDelete = async (itemId) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק מנה זו?')) {
            try {
                await MenuItem.delete(itemId);
                loadMenu(); // Refresh the list on success
                const newViewed = new Set(viewedItems);
                newViewed.delete(itemId);
                setViewedItems(newViewed);
            } catch (error) {
                console.error('שגיאה במחיקת המנה:', error);
                alert('אירעה שגיאה במחיקת המנה. ייתכן שהיא נמחקה על ידי משתמש אחר. מרענן את הרשימה...');
                loadMenu(); // Also refresh the list on error to handle stale data
            }
        }
    };

    const handleEditClick = (item) => {
        setEditingItem({ ...item }); // Create a shallow copy of the item for editing
        setIsEditDialogOpen(true);
    };

    const [imageUploading, setImageUploading] = useState(false);
    const [renamingCategory, setRenamingCategory] = useState(false);
    const [isCatDialogOpen, setIsCatDialogOpen] = useState(false);
    const [catEdits, setCatEdits] = useState([]);
    const [newCatName, setNewCatName] = useState('');

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImageUploading(true);
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setEditingItem(prev => ({ ...prev, image_url: file_url }));
        setImageUploading(false);
    };

    const handleUpdateItem = async () => {
        if (!editingItem) return;
        try {
            const itemToUpdate = {
                ...editingItem,
                price: parseFloat(editingItem.price)
            };
            const { id, ...dataToUpdate } = itemToUpdate;
            await base44.entities.MenuItem.update(id, dataToUpdate);
            setIsEditDialogOpen(false);
            setEditingItem(null);
            loadMenu();
        } catch (error) {
            console.error('שגיאה בעדכון המנה:', error);
            alert('שגיאה בעדכון המנה.');
        }
    };

    const handleRenameCategory = async (oldName, newName) => {
        if (!newName || newName === oldName) return;
        setRenamingCategory(true);
        try {
            const itemsInCategory = menuItems.filter(i => i.category === oldName);
            await Promise.all(itemsInCategory.map(i => base44.entities.MenuItem.update(i.id, { category: newName })));
            await loadMenu();
        } catch (error) {
            console.error('שגיאה בשינוי שם קטגוריה:', error);
        }
        setRenamingCategory(false);
    };

    const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', price: '', cost: '', description: '', category: '' });
    const [addingItem, setAddingItem] = useState(false);

    const openCatDialog = () => {
        const unique = [...new Set(menuItems.map(i => i.category))];
        setCatEdits(unique.map(c => ({ original: c, current: c })));
        setNewCatName('');
        setIsCatDialogOpen(true);
    };

    const saveCatEdits = async () => {
        setRenamingCategory(true);
        try {
            for (const edit of catEdits) {
                if (edit.current !== edit.original && edit.current.trim()) {
                    const items = menuItems.filter(i => i.category === edit.original);
                    await Promise.all(items.map(i => base44.entities.MenuItem.update(i.id, { category: edit.current.trim() })));
                }
            }
            await loadMenu();
        } catch (e) {
            console.error(e);
        }
        setRenamingCategory(false);
        setIsCatDialogOpen(false);
    };

    const handleDeleteCategory = async (catOriginal) => {
        const count = menuItems.filter(i => i.category === catOriginal).length;
        if (!window.confirm(`האם למחוק את הקטגוריה "${catOriginal}"? ${count > 0 ? `יימחקו גם ${count} מנות!` : ''}`)) return;
        setRenamingCategory(true);
        try {
            const items = menuItems.filter(i => i.category === catOriginal);
            await Promise.all(items.map(i => base44.entities.MenuItem.delete(i.id)));
            await loadMenu();
        } catch (e) {
            console.error(e);
        }
        setRenamingCategory(false);
        setCatEdits(prev => prev.filter(e => e.original !== catOriginal));
    };

    const openAddItemDialog = (categoryName) => {
        setNewItem({ name: '', price: '', cost: '0', description: '', category: categoryName });
        setIsAddItemDialogOpen(true);
    };

    const handleAddItem = async () => {
        if (!newItem.name || !newItem.price) return;
        setAddingItem(true);
        try {
            await base44.entities.MenuItem.create({
                name: newItem.name,
                price: parseFloat(newItem.price),
                cost: parseFloat(newItem.cost) || 0,
                description: newItem.description,
                category: newItem.category,
            });
            await loadMenu();
            setIsAddItemDialogOpen(false);
        } catch (e) {
            console.error(e);
        }
        setAddingItem(false);
    };
    
    // Predefined categories for the edit dialog's select input
    const menuCategories = ["מזאטים בחמארה", "ראשונות", "עיקריות", "המבורגרים", "סלטים", "קינוחים", "אלכוהול / קוקטיילים"];

    const getAvailableCategories = () => {
        const uniqueCategoriesFromItems = [...new Set(menuItems.map(item => item.category))];
        const allPossibleCategories = [...new Set([...uniqueCategoriesFromItems, ...menuCategories])];
        
        const categoryMap = {
            "מזאטים בחמארה": Flame,
            "ראשונות": Sparkles,
            "עיקריות": Beef,
            "המבורגרים": Utensils, // Changed from Hamburger to Utensils
            "סלטים": Leaf,
            "קינוחים": CakeSlice,
            "אלכוהול / קוקטיילים": Martini,
        };
        
        return [
            { id: 'all', name: 'כל התפריט', icon: ChefHat },
            ...allPossibleCategories.map(cat => ({
                id: cat,
                name: cat,
                icon: categoryMap[cat] || ChefHat
            }))
        ];
    };

    const categories = getAvailableCategories();

    const filteredItems = menuItems.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const handleItemView = (itemId) => {
        const newViewed = new Set(viewedItems);
        newViewed.add(itemId);
        setViewedItems(newViewed);
        
        if (newViewed.size >= Math.ceil(menuItems.length * 0.8)) {
            onComplete && onComplete();
        }
    };

    const getProgressPercentage = () => {
        if (menuItems.length === 0) return 0;
        return Math.round((viewedItems.size / menuItems.length) * 100);
    };

    const getAllergens = (item) => {
        if (item.allergens && Array.isArray(item.allergens)) {
            return item.allergens;
        }
        return [];
    };

    const getPopularityBadge = (score) => {
        const popularity = score || 75; // Default popularity if not provided
        if (popularity >= 90) return { text: 'מנת דגל', color: 'bg-yellow-100 text-yellow-800' };
        if (popularity >= 80) return { text: 'פופולרית', color: 'bg-green-100 text-green-800' };
        if (popularity >= 70) return { text: 'מבוקשת', color: 'bg-blue-100 text-blue-800' };
        return { text: 'רגילה', color: 'bg-gray-100 text-gray-800' };
    };

    if (loading) {
        return <div className="text-center py-8">טוען תפריט...</div>;
    }

    if (menuItems.length === 0) {
        return (
            <div className="text-center py-12">
                <ChefHat className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">אין מנות בתפריט</h3>
                <p className="text-gray-500">אנא הכנס מנות למסד הנתונים כדי להתחיל ללמוד</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8" dir="rtl">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
                    <ChefHat className="w-8 h-8 text-orange-600" />
                    תפריט המסעדה - מדריך למלצר
                </h1>
                <p className="text-gray-600">למד את כל המנות, האלרגנים וההמלצות</p>
                
                <div className="mt-4 p-4 bg-orange-50 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">התקדמות בלימוד התפריט</span>
                        <span className="text-sm font-bold text-orange-600">{viewedItems.size}/{menuItems.length}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                            className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${getProgressPercentage()}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                        {getProgressPercentage()}% - {getProgressPercentage() >= 80 ? 'מעולה! השיעור הושלם' : 'המשך לצפות במנות'}
                    </p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1">
                    <Search className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="חפש מנה..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pr-10"
                    />
                </div>
                {user?.role === 'admin' && (
                    <Button variant="outline" onClick={openCatDialog} className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        ערוך קטגוריות
                    </Button>
                )}
            </div>

            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
                <TabsList className="h-auto p-2 bg-transparent flex flex-wrap gap-3 justify-center">
                    {categories.map((category) => {
                        const IconComponent = category.icon;
                        return (
                            <TabsTrigger 
                                key={category.id} 
                                value={category.id} 
                                className="flex-grow data-[state=active]:shadow-lg data-[state=active]:bg-orange-600 data-[state=active]:text-white transition-all duration-300
                                           border-2 border-gray-200 bg-white hover:border-orange-500 rounded-lg px-4 py-3 flex items-center gap-3"
                            >
                                <IconComponent className="w-5 h-5" />
                                {user?.role === 'admin' && category.id !== 'all' ? (
                                    <CategoryRenameInline
                                        catName={category.name}
                                        onRename={handleRenameCategory}
                                        disabled={renamingCategory}
                                    />
                                ) : (
                                    <span className="font-semibold">{category.name}</span>
                                )}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>

                <div className="mt-8">
                    <h2 className="text-2xl font-bold mb-6 text-gray-900 border-b-2 border-orange-500 pb-2">
                        {categories.find(c => c.id === selectedCategory)?.name || 'כל התפריט'}
                    </h2>
                    
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {filteredItems.map((item) => {
                            const allergens = getAllergens(item);
                            const popularity = getPopularityBadge(item.popularity_score);
                            const isViewed = viewedItems.has(item.id);

                            return (
                                <Card 
                                    key={item.id} 
                                    className={`transition-all duration-300 ${
                                        isViewed ? 'ring-2 ring-green-200 bg-green-50' : 'hover:shadow-xl'
                                    }`}
                                >
                                    {item.image_url && (
                                        <div className="w-full h-40 overflow-hidden rounded-t-lg">
                                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover cursor-pointer" onClick={() => handleItemView(item.id)} />
                                        </div>
                                    )}
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start">
                                            <CardTitle 
                                                className="text-lg text-gray-900 cursor-pointer"
                                                onClick={() => handleItemView(item.id)}
                                            >
                                                {item.name}
                                                {isViewed && <span className="mr-2 text-green-600">✓</span>}
                                            </CardTitle>
                                            <div className="flex items-center gap-2">
                                                <Badge className={popularity.color}>
                                                    {popularity.text}
                                                </Badge>
                                                {user && user.role === 'admin' && (
                                                    <>
                                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditClick(item)}>
                                                        <Pencil className="h-4 w-4 text-blue-600" />
                                                      </Button>
                                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleItemDelete(item.id)}>
                                                        <Trash2 className="h-4 w-4 text-red-600" />
                                                      </Button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>
                                    
                                    <CardContent className="space-y-4 cursor-pointer" onClick={() => handleItemView(item.id)}>
                                        {item.description && (
                                            <p className="text-gray-600 text-sm leading-relaxed">
                                                {item.description}
                                            </p>
                                        )}

                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="w-4 h-4 text-green-600" />
                                                <span className="font-bold text-lg text-green-600">₪{item.price}</span>
                                            </div>
                                            {item.prep_time && (
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-gray-500" />
                                                    <span className="text-sm text-gray-500">{item.prep_time} דק'</span>
                                                </div>
                                            )}
                                        </div>

                                        {allergens.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                                    <span className="text-sm font-medium text-red-600">אלרגנים:</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {allergens.map((allergen, index) => (
                                                        <Badge key={index} variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                                            {allergen}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {item.upsell_suggestions && item.upsell_suggestions.length > 0 && (
                                            <div className="space-y-2">
                                                <span className="text-sm font-medium text-blue-600">💡 המלצות:</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {item.upsell_suggestions.map((suggestion, index) => (
                                                        <Badge key={index} variant="outline" className="text-xs bg-blue-50 text-blue-700">
                                                            {suggestion}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </Tabs>

            {filteredItems.length === 0 && (
                <div className="text-center py-12">
                    <ChefHat className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-xl font-semibold text-gray-600 mb-2">לא נמצאו מנות</h3>
                    <p className="text-gray-500">נסה לחפש משהו אחר או לשנות את הקטגוריה</p>
                </div>
            )}

            {getProgressPercentage() >= 80 && (
                <div className="text-center p-6 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="text-xl font-bold text-green-800 mb-2">🎉 כל הכבוד!</h3>
                    <p className="text-green-700">סיימת ללמוד את התפריט בהצלחה! עכשיו אתה מכיר את כל המנות ויכול לעבור לשיעור הבא.</p>
                </div>
            )}

            {/* Category Management Dialog */}
            <Dialog open={isCatDialogOpen} onOpenChange={setIsCatDialogOpen}>
                <DialogContent className="sm:max-w-[400px]" dir="rtl">
                    <DialogHeader>
                        <DialogTitle>ניהול קטגוריות</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2 max-h-72 overflow-y-auto">
                        {catEdits.map((edit, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <Input
                                    value={edit.current}
                                    onChange={e => {
                                        const updated = [...catEdits];
                                        updated[idx] = { ...edit, current: e.target.value };
                                        setCatEdits(updated);
                                    }}
                                    className="flex-1"
                                />
                                <span className="text-xs text-gray-400">{menuItems.filter(i => i.category === edit.original).length} מנות</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 pt-2 border-t">
                        <Input
                            placeholder="שם קטגוריה חדשה..."
                            value={newCatName}
                            onChange={e => setNewCatName(e.target.value)}
                            className="flex-1"
                        />
                        <Button variant="outline" size="icon" onClick={() => {
                            if (newCatName.trim()) {
                                setCatEdits(prev => [...prev, { original: newCatName.trim(), current: newCatName.trim() }]);
                                setNewCatName('');
                            }
                        }}>
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCatDialogOpen(false)}>ביטול</Button>
                        <Button onClick={saveCatEdits} disabled={renamingCategory}>
                            {renamingCategory ? <Loader className="w-4 h-4 animate-spin ml-1" /> : null}
                            שמור שינויים
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[425px]" dir="rtl">
                    <DialogHeader>
                        <DialogTitle>עריכת מנה</DialogTitle>
                    </DialogHeader>
                    {editingItem && (
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">שם</Label>
                                <Input id="name" value={editingItem.name} onChange={(e) => setEditingItem({...editingItem, name: e.target.value})} className="col-span-3" />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="category" className="text-right">קטגוריה</Label>
                                <Input
                                    id="category"
                                    value={editingItem.category}
                                    onChange={(e) => setEditingItem({...editingItem, category: e.target.value})}
                                    className="col-span-3"
                                    placeholder="שם קטגוריה..."
                                    list="category-suggestions"
                                />
                                <datalist id="category-suggestions">
                                    {menuCategories.map(cat => <option key={cat} value={cat} />)}
                                </datalist>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="price" className="text-right">מחיר</Label>
                                <Input id="price" type="number" value={editingItem.price} onChange={(e) => setEditingItem({...editingItem, price: e.target.value})} className="col-span-3" />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="description" className="text-right">תיאור</Label>
                                <Textarea id="description" value={editingItem.description || ''} onChange={(e) => setEditingItem({...editingItem, description: e.target.value})} className="col-span-3" />
                            </div>
                            {/* Image Upload */}
                            <div className="grid grid-cols-4 items-start gap-4">
                                <Label className="text-right pt-2">תמונה</Label>
                                <div className="col-span-3 space-y-2">
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="menu-item-image" />
                                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('menu-item-image').click()} disabled={imageUploading}>
                                        {imageUploading ? <Loader className="w-4 h-4 animate-spin ml-1" /> : <Image className="w-4 h-4 ml-1" />}
                                        {imageUploading ? 'מעלה...' : 'העלה תמונה'}
                                    </Button>
                                    {editingItem.image_url && (
                                        <div className="flex items-center gap-2">
                                            <img src={editingItem.image_url} alt="תצוגה מקדימה" className="h-20 w-20 object-cover rounded-lg border" />
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingItem(p => ({ ...p, image_url: '' }))} className="text-red-500">
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>ביטול</Button>
                        <Button onClick={handleUpdateItem}>שמור שינויים</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}