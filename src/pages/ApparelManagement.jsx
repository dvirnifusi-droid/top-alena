import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Trash2, Plus } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

export default function ApparelManagement() {
  const [apparel, setApparel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    cost: '',
    emoji: '',
    description: '',
    wearing_text: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadApparel();
  }, []);

  const loadApparel = async () => {
    const items = await base44.entities.Apparel.list();
    setApparel(items);
    setLoading(false);
  };

  const categories = [
    { value: 'shirt', label: '👕 חולצות' },
    { value: 'pants', label: '👖 מכנסיים' },
    { value: 'shoes', label: '👟 נעליים' },
    { value: 'hat', label: '🎩 כובעים' },
    { value: 'accessory', label: '✨ אביזרים' },
    { value: 'outerwear', label: '🧥 חיצוניות' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (value) => {
    setFormData(prev => ({ ...prev, category: value }));
  };

  const handleAddItem = async () => {
    if (!formData.name || !formData.category || !formData.cost || !formData.emoji || !formData.wearing_text) {
      alert('אנא מלא את כל השדות הנדרשים');
      return;
    }

    setSubmitting(true);
    try {
      await base44.entities.Apparel.create({
        name: formData.name,
        category: formData.category,
        cost: parseInt(formData.cost),
        emoji: formData.emoji,
        description: formData.description,
        wearing_text: formData.wearing_text,
        is_active: true,
        rarity: 'common'
      });

      setFormData({
        name: '',
        category: '',
        cost: '',
        emoji: '',
        description: '',
        wearing_text: ''
      });

      await loadApparel();
    } catch (error) {
      console.error('Error adding item:', error);
      alert('שגיאה בהוספת הפריט');
    }
    setSubmitting(false);
  };

  const handleDeleteItem = async (id) => {
    if (confirm('האם אתה בטוח שברצונך למחוק את הפריט?')) {
      try {
        await base44.entities.Apparel.delete(id);
        await loadApparel();
      } catch (error) {
        console.error('Error deleting item:', error);
        alert('שגיאה במחיקת הפריט');
      }
    }
  };

  if (loading) return <div className="text-center py-8">טוען...</div>;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold mb-6">📦 ניהול חנות בגדים</h1>
        
        <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 space-y-4">
          <h2 className="text-xl font-bold">הוספת פריט חדש</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">שם הפריט *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="לדוגמה: חולצה כחולה"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">קטגוריה *</label>
              <Select value={formData.category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר קטגוריה" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">מחיר (מטבעות) *</label>
              <Input
                name="cost"
                type="number"
                value={formData.cost}
                onChange={handleInputChange}
                placeholder="לדוגמה: 100"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">אימוג'י *</label>
              <Input
                name="emoji"
                value={formData.emoji}
                onChange={handleInputChange}
                placeholder="לדוגמה: 👕"
                maxLength="2"
                className="w-full"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold mb-2">תיאור קצר</label>
              <Input
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="תיאור קצר של הפריט"
                className="w-full"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold mb-2">טקסט לAI (איך הדמות נראית עם זה) *</label>
              <Input
                name="wearing_text"
                value={formData.wearing_text}
                onChange={handleInputChange}
                placeholder="לדוגמה: wearing a blue t-shirt with gold logo"
                className="w-full"
              />
            </div>
          </div>

          <Button
            onClick={handleAddItem}
            disabled={submitting}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold"
          >
            <Plus className="w-4 h-4 mr-2" />
            {submitting ? 'מוסיף...' : 'הוסף פריט'}
          </Button>
        </Card>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4">רשימת פריטים</h2>
        
        {apparel.length === 0 ? (
          <div className="text-center py-8 text-gray-500">אין פריטים בחנות עדיין</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apparel.map(item => (
              <Card key={item.id} className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="text-3xl">{item.emoji}</div>
                  <Button
                    onClick={() => handleDeleteItem(item.id)}
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                <h3 className="font-bold text-sm mb-1">{item.name}</h3>
                <p className="text-xs text-gray-600 mb-2">{item.description}</p>
                
                <div className="space-y-1 text-xs mb-3">
                  <p><strong>קטגוריה:</strong> {categories.find(c => c.value === item.category)?.label}</p>
                  <p><strong>מחיר:</strong> {item.cost} 🪙</p>
                  <p className="text-gray-500"><strong>AI:</strong> {item.wearing_text}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}