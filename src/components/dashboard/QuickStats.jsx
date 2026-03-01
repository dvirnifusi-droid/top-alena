import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';

const colorSchemes = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-800', iconBg: 'bg-blue-500' },
  green: { bg: 'bg-green-100', text: 'text-green-800', iconBg: 'bg-green-500' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-800', iconBg: 'bg-orange-500' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-800', iconBg: 'bg-purple-500' },
  red: { bg: 'bg-red-100', text: 'text-red-800', iconBg: 'bg-red-500' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800', iconBg: 'bg-yellow-500' },
};

export default function QuickStats({ title, value, icon: Icon, color = 'blue', trend, isLoading }) {
  const { bg, text, iconBg } = colorSchemes[color];

  if (isLoading) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 lg:p-6">
          <Skeleton className="h-4 lg:h-5 w-16 lg:w-24" />
          <Skeleton className="h-6 lg:h-7 w-6 lg:w-7 rounded-lg" />
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-0 lg:pt-0">
          <Skeleton className="h-6 lg:h-8 w-10 lg:w-12 mt-1" />
          <Skeleton className="h-3 lg:h-4 w-16 lg:w-20 mt-2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`shadow-sm border-slate-200 ${bg} overflow-hidden`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 lg:p-6">
        <CardTitle className={`text-xs lg:text-sm font-medium ${text} leading-tight`}>{title}</CardTitle>
        <div className={`p-1.5 lg:p-2 rounded-lg ${iconBg} text-white shadow-md`}>
          <Icon className="w-3 h-3 lg:w-4 lg:h-4" />
        </div>
      </CardHeader>
      <CardContent className="p-3 lg:p-6 pt-0 lg:pt-0">
        <div className={`text-lg lg:text-2xl font-bold ${text}`}>{value}</div>
        <p className="text-xs text-slate-600 leading-tight">{trend}</p>
      </CardContent>
    </Card>
  );
}