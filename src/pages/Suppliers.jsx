
import React, { useState, useEffect } from 'react';
import { Supplier } from '@/entities/Supplier';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building, Phone, Mail, Star, Plus, Edit, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import InvoiceScanner from '../components/dashboard/InvoiceScanner';

function SupplierForm({ supplier, onSave, onCancel }) {
  const [formData, setFormData] = useState(
    supplier || {
      company_name: "",
      supplier_id: "",
      contact_person: "",
      email: "",
      phone: "",
      category: "materials",
      status: "active",
      rating: 3,
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="company_name">שם חברה</Label>
        <Input id="company_name" value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} required />
      </div>
      <div>
        <Label htmlFor="contact_person">איש קשר</Label>
        <Input id="contact_person" value={formData.contact_person} onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })} required />
      </div>
      <div>
        <Label htmlFor="email">אימייל</Label>
        <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
      </div>
      <div>
        <Label htmlFor="phone">טלפון</Label>
        <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="category">קטגוריה</Label>
        <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="materials">חומרי גלם</SelectItem>
            <SelectItem value="services">שירותים</SelectItem>
            <SelectItem value="equipment">ציוד</SelectItem>
            <SelectItem value="catering">קייטרינג</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>ביטול</Button>
        <Button type="submit">שמור</Button>
      </div>
    </form>
  );
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await Supplier.list('-created_date');
      setSuppliers(data);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data) => {
    try {
      if (editingSupplier) {
        await Supplier.update(editingSupplier.id, data);
      } else {
        // Create new with a unique supplier_id
        await Supplier.create({ ...data, supplier_id: `SUP-${Date.now()}` });
      }
      setIsFormOpen(false);
      setEditingSupplier(null);
      loadSuppliers();
    } catch (error) {
      console.error("Failed to save supplier:", error);
    }
  };
  
  const handleDeleteSupplier = async (supplierId) => {
    if (window.confirm("האם אתה בטוח שברצונך למחוק את הספק? פעולה זו היא בלתי הפיכה.")) {
      try {
        await Supplier.delete(supplierId);
        loadSuppliers(); // Refresh the list of suppliers
      } catch (error) {
        console.error("Failed to delete supplier:", error);
        alert("שגיאה במחיקת הספק.");
      }
    }
  };

  const openForm = (supplier = null) => {
      setEditingSupplier(supplier);
      setIsFormOpen(true);
  }

  const statusColors = {
    active: "bg-green-100 text-green-800",
    inactive: "bg-red-100 text-red-800",
    pending_approval: "bg-yellow-100 text-yellow-800",
  };

  const categoryTranslations = {
    materials: "חומרי גלם",
    services: "שירותים",
    equipment: "ציוד",
    catering: "קייטרינג"
  };

  if (loading) return <div className="text-center p-8">טוען ספקים...</div>;

  return (
    <div className="p-4 sm:p-8 bg-gradient-to-br from-orange-50 to-red-50 min-h-screen" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">ניהול ספקים</h1>
            <p className="text-lg text-slate-600 mt-2">ניהול כל הספקים, המוצרים וההזמנות</p>
          </div>
          <Button onClick={() => openForm()} className="bg-orange-600 hover:bg-orange-700">
            <Plus className="w-5 h-5 ml-2" />
            הוסף ספק חדש
          </Button>
        </div>
        
        <div className="mb-8">
            <InvoiceScanner />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {suppliers.map((supplier) => (
            <Card key={supplier.id} className="flex flex-col justify-between hover:shadow-lg transition-shadow duration-300">
               <Link to={createPageUrl(`SupplierDetails?id=${supplier.id}`)} className="flex flex-col flex-grow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                        <Building className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{supplier.company_name}</CardTitle>
                        <Badge className={statusColors[supplier.status] || 'bg-gray-100'}>
                          {supplier.status === 'active' ? 'פעיל' : 'לא פעיל'}
                        </Badge>
                      </div>
                    </div>
                    {supplier.rating && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                        <span className="text-sm font-medium">{supplier.rating}</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                  <Badge variant="outline">{categoryTranslations[supplier.category] || supplier.category}</Badge>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-500" /><span>{supplier.contact_person}</span></div>
                    <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-500" /><span>{supplier.email}</span></div>
                  </div>
                </CardContent>
              </Link>
              <div className="p-4 border-t flex items-center gap-2">
                 <Button variant="outline" className="w-full" asChild>
                    <Link to={createPageUrl(`SupplierDetails?id=${supplier.id}`)}>נהל מוצרים</Link>
                </Button>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openForm(supplier);}}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-red-600 hover:bg-red-100" onClick={(e) => { e.stopPropagation(); handleDeleteSupplier(supplier.id);}}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>{editingSupplier ? 'עריכת ספק' : 'הוספת ספק חדש'}</DialogTitle>
            </DialogHeader>
            <SupplierForm 
                supplier={editingSupplier} 
                onSave={handleSave} 
                onCancel={() => { setIsFormOpen(false); setEditingSupplier(null); }} 
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
