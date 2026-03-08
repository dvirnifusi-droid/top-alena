import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ApparelShop({ employeeId, balance, onPurchase, onApparelUpdate, currentApparel }) {
  const [apparel, setApparel] = useState([]);
  const [ownedApparel, setOwnedApparel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [employeeApparelId, setEmployeeApparelId] = useState(null);

  useEffect(() => {
    loadApparel();
  }, [employeeId]);

  const loadApparel = async () => {
    const items = await base44.entities.Apparel.list();
    setApparel(items.filter(a => a.is_active));
    
    const employed = await base44.entities.EmployeeApparel.filter({ employee_id: employeeId });
    if (employed.length > 0) {
      setEmployeeApparelId(employed[0].id);
      setOwnedApparel(employed[0].owned_apparel || []);
    }
    setLoading(false);
  };

  const handlePurchase = async (item) => {
    if (balance < item.cost) {
      alert(`אין מספיק מטבעות! נדרשים ${item.cost} 🪙`);
      return;
    }

    const newOwned = [...ownedApparel, item.id];
    setOwnedApparel(newOwned);

    // עדכן ב-DB
    if (employeeApparelId) {
      await base44.entities.EmployeeApparel.update(employeeApparelId, { owned_apparel: newOwned });
    }

    // קרא ל-callback של ההוצאה
    await onPurchase(item);
    
    // עדכן את הדמות להציג את הפריט החדש אוטומטית
    if (onApparelUpdate) {
      onApparelUpdate(item);
    }
  };

  const isOwned = (id) => ownedApparel.includes(id);

  const filteredApparel = selectedFilter === 'all' 
    ? apparel 
    : apparel.filter(a => a.category === selectedFilter);

  if (loading) return <div className="text-center py-4">טוען...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <Tabs defaultValue="all" onValueChange={setSelectedFilter}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="all">הכל</TabsTrigger>
          <TabsTrigger value="shirt">👕 חולצות</TabsTrigger>
          <TabsTrigger value="pants">👖 מכנס</TabsTrigger>
          <TabsTrigger value="shoes">👟 נעליים</TabsTrigger>
          <TabsTrigger value="hat">🎩 כובעים</TabsTrigger>
          <TabsTrigger value="accessory">✨ אביזרים</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filteredApparel.map(item => (
          <div key={item.id} className={`p-3 rounded-xl border-2 transition-all ${
            isOwned(item.id)
              ? 'border-green-400 bg-green-50'
              : 'border-gray-200 bg-white hover:border-blue-400'
          }`}>
            <div className="text-3xl text-center mb-2">{item.emoji}</div>
            <p className="text-sm font-bold text-right mb-1">{item.name}</p>
            <p className="text-xs text-gray-600 text-right mb-3">{item.description}</p>
            
            {isOwned(item.id) ? (
              <div className="text-xs font-bold text-green-600 bg-green-100 py-2 rounded text-center">
                ✅ בבעלותך
              </div>
            ) : (
              <Button
                onClick={() => handlePurchase(item)}
                disabled={balance < item.cost}
                size="sm"
                className="w-full text-xs"
              >
                {item.cost} 🪙
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}