
import React, { useState, useEffect, useCallback } from 'react';
import { Supplier } from '@/entities/Supplier';
import { Product } from '@/entities/Product';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, ArrowRight, Building } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageHeader from '@/components/shared/PageHeader';

function ProductForm({ product, supplierId, onSave, onCancel }) {
  const [formData, setFormData] = useState(
    product || {
      name: "",
      supplier_id: supplierId,
      category: "food",
      price: 0,
      unit: "kg",
      current_stock: 0,
      desired_stock: 0
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">שם מוצר</Label>
          <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
        </div>
        <div>
            <Label htmlFor="category">קטגוריה</Label>
            <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                    <SelectItem value="food">מזון</SelectItem>
                    <SelectItem value="beverage">שתיה</SelectItem>
                    <SelectItem value="alcohol">אלכוהול</SelectItem>
                    <SelectItem value="cleaning">ניקיון</SelectItem>
                    <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
            </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="price">מחיר ליחידה</Label>
          <Input id="price" type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })} />
        </div>
        <div>
            <Label htmlFor="unit">יחידת מידה</Label>
            <Select value={formData.unit} onValueChange={(value) => setFormData({...formData, unit: value})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                    <SelectItem value="kg">ק"ג</SelectItem>
                    <SelectItem value="liter">ליטר</SelectItem>
                    <SelectItem value="piece">יחידה</SelectItem>
                    <SelectItem value="bottle">בקבוק</SelectItem>
                    <SelectItem value="package">חבילה</SelectItem>
                </SelectContent>
            </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="current_stock">מלאי נוכחי</Label>
          <Input id="current_stock" type="number" value={formData.current_stock} onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })} />
        </div>
        <div>
          <Label htmlFor="desired_stock">מלאי רצוי</Label>
          <Input id="desired_stock" type="number" value={formData.desired_stock} onChange={(e) => setFormData({ ...formData, desired_stock: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>ביטול</Button>
        <Button type="submit">שמור מוצר</Button>
      </div>
    </form>
  );
}

export default function SupplierDetails() {
  const [supplier, setSupplier] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const location = useLocation();
  const supplierId = new URLSearchParams(location.search).get('id');

  const loadData = useCallback(async () => {
    if (!supplierId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [supplierData, productsData] = await Promise.all([
        Supplier.get(supplierId),
        Product.filter({ supplier_id: supplierId }, '-created_date'),
      ]);
      setSupplier(supplierData);
      setProducts(productsData);
    } catch (error) {
      console.error("Error loading supplier details:", error);
    } finally {
      setLoading(false);
    }
  }, [supplierId]); // Add supplierId to useCallback dependencies

  useEffect(() => {
    loadData();
  }, [loadData]); // useEffect now depends on the memoized loadData function
  
  const openForm = (product = null) => {
      setEditingProduct(product);
      setIsFormOpen(true);
  }

  const handleSaveProduct = async (data) => {
    try {
      if (editingProduct) {
        await Product.update(editingProduct.id, data);
      } else {
        await Product.create(data);
      }
      setIsFormOpen(false);
      setEditingProduct(null);
      loadData();
    } catch (error) {
        console.error("Failed to save product:", error);
    }
  };

  const handleDeleteProduct = async (productId) => {
      if (window.confirm("האם למחוק את המוצר?")) {
          try {
              await Product.delete(productId);
              loadData();
          } catch(error) {
              console.error("Failed to delete product:", error);
          }
      }
  };
  
  if (loading) return <div className="text-center p-8">טוען פרטי ספק...</div>;
  if (!supplier) return <div className="text-center p-8">לא נמצא ספק.</div>;

  return (
    <div className="p-4 sm:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
            <Button asChild variant="outline">
                <Link to={createPageUrl('Suppliers')}><ArrowRight className="w-4 h-4 ml-2" /> חזרה לרשימת הספקים</Link>
            </Button>
        </div>
        
        <PageHeader
            title={supplier.company_name}
            subtitle={`איש קשר: ${supplier.contact_person} | ${supplier.email}`}
            icon={Building}
        />

        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>מוצרים</CardTitle>
                    <CardDescription>רשימת המוצרים המסופקים על ידי {supplier.company_name}</CardDescription>
                </div>
                <Button onClick={() => openForm()}>
                    <Plus className="w-4 h-4 ml-2"/> הוסף מוצר
                </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>שם מוצר</TableHead>
                            <TableHead>קטגוריה</TableHead>
                            <TableHead>מחיר</TableHead>
                            <TableHead>יחידת מידה</TableHead>
                            <TableHead>מלאי נוכחי</TableHead>
                            <TableHead>מלאי רצוי</TableHead>
                            <TableHead>פעולות</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {products.map(product => (
                            <TableRow key={product.id}>
                                <TableCell>{product.name}</TableCell>
                                <TableCell>{product.category}</TableCell>
                                <TableCell>₪{product.price}</TableCell>
                                <TableCell>{product.unit}</TableCell>
                                <TableCell>{product.current_stock}</TableCell>
                                <TableCell>{product.desired_stock}</TableCell>
                                <TableCell className="flex gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => openForm(product)}><Edit className="w-4 h-4" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteProduct(product.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {products.length === 0 && <p className="text-center text-gray-500 py-8">אין מוצרים לספק זה. לחץ על "הוסף מוצר" כדי להתחיל.</p>}
            </CardContent>
        </Card>

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent dir="rtl" className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{editingProduct ? "עריכת מוצר" : "הוספת מוצר חדש"}</DialogTitle>
                </DialogHeader>
                <ProductForm 
                    product={editingProduct}
                    supplierId={supplierId}
                    onSave={handleSaveProduct}
                    onCancel={() => { setIsFormOpen(false); setEditingProduct(null); }}
                />
            </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
