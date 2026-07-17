import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, Filter, X } from "lucide-react";
import { format } from "date-fns";

export default function InvoiceFilters({ suppliers, onFilterChange }) {
    const initialState = {
        date: null,
        supplierId: 'all',
        paymentStatus: 'all',
        source: 'all',
        minAmount: '',
        maxAmount: ''
    };
    const [filters, setFilters] = useState(initialState);

    useEffect(() => {
        onFilterChange(filters);
    }, [filters, onFilterChange]);

    const handleReset = () => {
        setFilters(initialState);
    };

    return (
        <Card className="mb-6 shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Filter className="w-5 h-5" />
                    סינון חשבוניות
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    {/* Date Range Picker */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="date-range">טווח תאריכים</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className="w-full justify-start text-left font-normal"
                                >
                                    <CalendarIcon className="ml-2 h-4 w-4" />
                                    {filters.date?.from ? (
                                        filters.date.to ? (
                                            <>
                                                {format(filters.date.from, "dd/MM/yy")} -{" "}
                                                {format(filters.date.to, "dd/MM/yy")}
                                            </>
                                        ) : (
                                            format(filters.date.from, "dd/MM/yyyy")
                                        )
                                    ) : (
                                        <span>בחר טווח</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={filters.date?.from}
                                    selected={filters.date}
                                    onSelect={(date) => setFilters(f => ({ ...f, date }))}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Supplier Select */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="supplier-select">ספק</Label>
                        <Select value={filters.supplierId} onValueChange={(value) => setFilters(f => ({ ...f, supplierId: value }))}>
                            <SelectTrigger id="supplier-select">
                                <SelectValue placeholder="בחר ספק" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">כל הספקים</SelectItem>
                                {suppliers.map(supplier => (
                                    <SelectItem key={supplier.id} value={supplier.id}>{supplier.company_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Payment Status Select */}
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="payment-status-select">סטטוס תשלום</Label>
                        <Select value={filters.paymentStatus} onValueChange={(value) => setFilters(f => ({ ...f, paymentStatus: value }))}>
                            <SelectTrigger id="payment-status-select">
                                <SelectValue placeholder="בחר סטטוס" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">הכל</SelectItem>
                                <SelectItem value="paid">שולם</SelectItem>
                                <SelectItem value="unpaid">לא שולם</SelectItem>
                                <SelectItem value="scheduled">ישולם בתאריך</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Source — where the invoice came from */}
                    <div className="flex flex-col gap-1.5">
                        <Label>מקור החשבונית</Label>
                        <Select value={filters.source} onValueChange={(value) => setFilters(f => ({ ...f, source: value }))}>
                            <SelectTrigger>
                                <SelectValue placeholder="כל המקורות" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">כל המקורות</SelectItem>
                                <SelectItem value="email">📥 מייל</SelectItem>
                                <SelectItem value="whatsapp">💬 וואטסאפ</SelectItem>
                                <SelectItem value="manual">✍️ ידני</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Amount Range */}
                    <div className="flex flex-col gap-1.5">
                        <Label>טווח סכום</Label>
                        <div className="flex gap-2">
                            <Input
                                type="number"
                                placeholder="מ-"
                                value={filters.minAmount}
                                onChange={(e) => setFilters(f => ({ ...f, minAmount: e.target.value }))}
                            />
                            <Input
                                type="number"
                                placeholder="עד-"
                                value={filters.maxAmount}
                                onChange={(e) => setFilters(f => ({ ...f, maxAmount: e.target.value }))}
                            />
                        </div>
                    </div>
                    
                    {/* Reset Button */}
                    <div className="flex items-end">
                         <Button onClick={handleReset} variant="ghost" className="w-full text-slate-600 hover:bg-slate-100">
                            <X className="w-4 h-4 ml-2" />
                            נקה סינונים
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}