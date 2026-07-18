import React, { useState, useEffect, useRef } from 'react';
import { Incident } from '@/entities/all';
import PageGuard from '../components/shared/PageGuard';
import PageHeader from '@/components/shared/PageHeader';
import { User } from '@/entities/User';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle, 
  Plus, 
  Users,
  Wrench,
  Sparkles,
  Shield,
  ChefHat,
  Wine,
  CreditCard,
  Edit,
  Eye,
  EyeOff,
  RefreshCw,
  Camera,
  X
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import IncidentAiAnalysis from '@/components/ai/IncidentAiAnalysis';

// קטגוריות עם אייקונים
const categoryConfig = {
  customer_service: { name: 'שירות לקוחות', icon: Users, color: 'bg-[#F4ECD8] text-[#2E3819]' },
  maintenance: { name: 'תחזוקה וציוד', icon: Wrench, color: 'bg-orange-100 text-orange-800' },
  cleanliness: { name: 'נקיון', icon: Sparkles, color: 'bg-green-100 text-green-800' },
  staff: { name: 'כוח אדם', icon: Users, color: 'bg-[#F4ECD8] text-[#7A3722]' },
  security: { name: 'ביטחון', icon: Shield, color: 'bg-red-100 text-red-800' },
  safety: { name: 'בטיחות', icon: Shield, color: 'bg-[#F4ECD8] text-yellow-800' },
  kitchen: { name: 'מטבח', icon: ChefHat, color: 'bg-amber-100 text-amber-800' },
  bar: { name: 'בר', icon: Wine, color: 'bg-[#F4ECD8] text-indigo-800' },
  pos_system: { name: 'מערכת קופות', icon: CreditCard, color: 'bg-gray-100 text-gray-800' }
};

const severityConfig = {
  low: 'bg-[#F4ECD8] text-[#2E3819]',
  medium: 'bg-[#F4ECD8] text-yellow-800', 
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800'
};

const statusConfig = {
  reported: { name: 'חדש', color: 'bg-red-100 text-red-800' },
  investigating: { name: 'בבדיקה', color: 'bg-[#F4ECD8] text-yellow-800' },
  in_progress: { name: 'בטיפול', color: 'bg-orange-100 text-orange-800' },
  resolved: { name: 'נפתר', color: 'bg-green-100 text-green-800' },
  closed: { name: 'סגור', color: 'bg-gray-200 text-gray-800' }
};

const visibilityConfig = { // Added
  managers_only: { name: 'מנהלים בלבד', icon: Shield, color: 'bg-red-100 text-red-800' },
  managers_and_employees: { name: 'מנהלים ועובדים', icon: Users, color: 'bg-[#F4ECD8] text-[#2E3819]' },
  employees_only: { name: 'עובדים בלבד', icon: Eye, color: 'bg-green-100 text-green-800' },
  owners_only: { name: 'בעלים בלבד', icon: EyeOff, color: 'bg-[#F4ECD8] text-[#7A3722]' }
};

const cardBackgroundByStatus = {
  reported: 'bg-red-50 border border-red-100',
  investigating: 'bg-[#FAF5E8] border border-[#F4ECD8]',
  in_progress: 'bg-[#FAF5E8] border border-[#F4ECD8]',
  resolved: 'bg-green-50 border border-green-100',
  closed: 'bg-white'
};

function IncidentForm({ incident, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    title: incident?.title || '',
    description: incident?.description || '',
    category: incident?.category || '',
    severity: incident?.severity || 'medium',
    location: incident?.location || '',
    customer_reaction: incident?.customer_reaction || '',
    solution_provided: incident?.solution_provided || '',
    impact_on_shift: incident?.impact_on_shift || '',
    estimated_cost: incident?.estimated_cost === undefined ? null : incident?.estimated_cost,
    prevention_measures: incident?.prevention_measures || '',
    status: incident?.status || 'reported',
    visibility_level: incident?.visibility_level || 'managers_and_employees',
    photo_url: incident?.photo_url || ''
  });

  const [user, setUser] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef();

  useEffect(() => {
    User.me().then(setUser);
  }, []);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, photo_url: file_url }));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Clean the data before sending - remove empty strings and convert numbers
    const cleanedData = { ...formData };
    
    // Handle estimated_cost - only include if it has a valid number value
    if (cleanedData.estimated_cost === null || cleanedData.estimated_cost === '' || isNaN(cleanedData.estimated_cost)) {
      delete cleanedData.estimated_cost;
    } else {
      cleanedData.estimated_cost = parseFloat(cleanedData.estimated_cost);
    }
    
    const incidentData = {
      ...cleanedData,
      incident_number: incident?.incident_number || `INC-${Date.now()}`,
      incident_date: incident?.incident_date || new Date().toISOString(),
      reported_by: user?.email || 'unknown',
      ...(cleanedData.status === 'resolved' && !incident?.resolution_date && { resolution_date: new Date().toISOString() })
    };
    onSave(incidentData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label htmlFor="title">כותרת התקרית</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            placeholder="תאר בקצרה מה קרה"
            required
          />
        </div>

        <div>
          <Label htmlFor="category">קטגוריה</Label>
          <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
            <SelectTrigger>
              <SelectValue placeholder="בחר קטגוריה" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(categoryConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="severity">רמת חומרה</Label>
          <Select value={formData.severity} onValueChange={(value) => setFormData({...formData, severity: value})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">נמוכה</SelectItem>
              <SelectItem value="medium">בינונית</SelectItem>
              <SelectItem value="high">גבוהה</SelectItem>
              <SelectItem value="critical">קריטית</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="location">מיקום</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => setFormData({...formData, location: e.target.value})}
            placeholder="איפה זה קרה? (שולחן 5, מטבח, בר...)"
          />
        </div>

        <div>
          <Label htmlFor="status">סטטוס</Label>
          <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2"> {/* Added */}
          <Label htmlFor="visibility_level">רמת הרשאות צפייה</Label>
          <Select value={formData.visibility_level} onValueChange={(value) => setFormData({...formData, visibility_level: value})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(visibilityConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <config.icon className="w-4 h-4" />
                    {config.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            קובע מי יוכל לראות את התקרית הזו במערכת
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="description">תיאור מפורט</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="תאר בפירות מה קרה, מתי, ואיך זה התגלה"
          className="h-24"
          required
        />
      </div>

      {(formData.category === 'customer_service' || formData.customer_reaction) && (
        <div>
          <Label htmlFor="customer_reaction">תגובת הלקוח</Label>
          <Textarea
            id="customer_reaction"
            value={formData.customer_reaction}
            onChange={(e) => setFormData({...formData, customer_reaction: e.target.value})}
            placeholder="איך הלקוח הגיב? מה הוא אמר? איך הוא הרגיש?"
            className="h-20"
          />
        </div>
      )}

      <div>
        <Label htmlFor="solution_provided">פתרון שניתן</Label>
        <Textarea
          id="solution_provided"
          value={formData.solution_provided}
          onChange={(e) => setFormData({...formData, solution_provided: e.target.value})}
          placeholder="מה עשיתם כדי לפתור? איך טיפלתם בבעיה?"
          className="h-20"
        />
      </div>

      <div>
        <Label htmlFor="impact_on_shift">השפעה על המשמרת</Label>
        <Textarea
          id="impact_on_shift"
          value={formData.impact_on_shift}
          onChange={(e) => setFormData({...formData, impact_on_shift: e.target.value})}
          placeholder="איך זה השפיע על המשמרת? האם עיכב שירות? גרם לעיכובים?"
          className="h-20"
        />
      </div>

      {(formData.category === 'maintenance' || formData.estimated_cost !== null) && (
        <div>
          <Label htmlFor="estimated_cost">עלות מוערכת לתיקון (₪)</Label>
          <Input
            id="estimated_cost"
            type="number"
            value={formData.estimated_cost === null ? '' : formData.estimated_cost} // Display empty string for null
            onChange={(e) => {
              const value = e.target.value;
              setFormData({
                ...formData, 
                estimated_cost: value === '' ? null : parseFloat(value)
              });
            }}
            placeholder="כמה זה יעלה בערך לתקן?"
          />
        </div>
      )}

      <div>
        <Label htmlFor="prevention_measures">אמצעי מניעה לעתיד</Label>
        <Textarea
          id="prevention_measures"
          value={formData.prevention_measures}
          onChange={(e) => setFormData({...formData, prevention_measures: e.target.value})}
          placeholder="איך אפשר למנוע את זה בעתיד? איזה שינויים נדרשים?"
          className="h-20"
        />
      </div>

      {/* צילום תמונה */}
      <div>
        <Label>תמונה (אופציונלי)</Label>
        <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
        {formData.photo_url ? (
          <div className="relative mt-2 inline-block">
            <img src={formData.photo_url} alt="תמונת תקרית" className="w-full max-h-48 object-cover rounded-lg border" />
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, photo_url: '' }))}
              className="absolute top-1 left-1 bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full border-dashed"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
          >
            <Camera className="w-4 h-4 ml-2" />
            {uploadingPhoto ? 'מעלה תמונה...' : 'צלם / העלה תמונה'}
          </Button>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>ביטול</Button>
        <Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={uploadingPhoto}>
          {incident ? 'עדכן תקרית' : 'דווח תקרית'}
        </Button>
      </div>
    </form>
  );
}

function IncidentCard({ incident, onEdit, canEdit }) { // Added canEdit prop
  const categoryConfig_local = categoryConfig[incident.category];
  const Icon = categoryConfig_local?.icon || AlertTriangle;
  const backgroundClass = cardBackgroundByStatus[incident.status] || 'bg-white';
  const visibilityInfo = visibilityConfig[incident.visibility_level]; // Added

  return (
    <Card className={`hover:shadow-xl transition-all duration-300 ${backgroundClass}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5 text-gray-600" />
            <div>
              <CardTitle className="text-lg">{incident.title}</CardTitle>
              <p className="text-sm text-gray-500">#{incident.incident_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusConfig[incident.status]?.color || 'bg-gray-100'}>
              {statusConfig[incident.status]?.name || incident.status}
            </Badge>
            {canEdit && ( // Conditional render for edit button
              <Button variant="ghost" size="sm" onClick={() => onEdit(incident)}>
                <Edit className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">{incident.description}</p>
          
          <div className="flex flex-wrap gap-2">
            <Badge className={categoryConfig_local?.color}>
              {categoryConfig_local?.name}
            </Badge>
            <Badge className={severityConfig[incident.severity]}>
              {incident.severity}
            </Badge>
            {/* Added visibility level badge */}
            {visibilityInfo && (
              <Badge className={visibilityInfo.color}>
                <visibilityInfo.icon className="w-3 h-3 ml-1" /> {/* Changed mr-1 to ml-1 for RTL */}
                {visibilityInfo.name}
              </Badge>
            )}
          </div>

          <div className="text-sm text-gray-600 space-y-1">
            {incident.location && <p><strong>מיקום:</strong> {incident.location}</p>}
            <p><strong>תאריך:</strong> {new Date(incident.incident_date).toLocaleDateString('he-IL')}</p>
            {incident.solution_provided && <p><strong>פתרון:</strong> {incident.solution_provided}</p>}
          </div>

          {incident.impact_on_shift && (
            <div className="p-2 bg-orange-50 rounded text-sm">
              <strong>השפעה על המשמרת:</strong> {incident.impact_on_shift}
            </div>
          )}
          {incident.photo_url && (
            <img src={incident.photo_url} alt="תמונת תקרית" className="w-full max-h-40 object-cover rounded-lg border mt-2 cursor-pointer" onClick={() => window.open(incident.photo_url, '_blank')} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IncidentsInner() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);
  const [filter, setFilter] = useState('all');
  const [currentUser, setCurrentUser] = useState(null); // Added

  useEffect(() => {
    loadData(); // Changed to loadData
  }, []);

  // Combined data loading function
  const loadData = async () => {
    setLoading(true);
    try {
      const [incidentData, userData] = await Promise.all([
        Incident.list('-incident_date'), // מיון לפי תאריך יורד - החדשות ביותר ראשונות
        User.me()
      ]);
      setCurrentUser(userData);
      setIncidents(incidentData);
      console.log('נטענו תקריות:', incidentData.length);
    } catch (error) {
      console.error('שגיאה בטעינת תקריות:', error);
    }
    setLoading(false);
  };

  // Filter incidents based on user permissions
  const getVisibleIncidents = () => { // Added
    if (!currentUser) return [];
    
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'owner');
    const isManager = currentUser.role === 'manager'; // Assuming 'manager' role for managers
    const isEmployee = currentUser.role === 'employee'; // Assuming 'employee' role for regular employees
    const isOwner = currentUser.role === 'owner'; // Assuming 'owner' role

    return incidents.filter(incident => {
      // Admins see everything
      if (isAdmin) return true;
      
      const visibility = incident.visibility_level;

      if (isOwner) {
        return visibility === 'owners_only' || visibility === 'managers_only' || visibility === 'managers_and_employees' || visibility === 'employees_only';
      }

      if (isManager) {
        return visibility === 'managers_only' || visibility === 'managers_and_employees' || visibility === 'employees_only';
      }

      if (isEmployee) {
        return visibility === 'employees_only' || visibility === 'managers_and_employees';
      }

      // Default: if user role not recognized or no specific access
      return false;
    });
  };

  const handleSaveIncident = async (incidentData) => {
    try {
      if (editingIncident) {
        await Incident.update(editingIncident.id, incidentData);
      } else {
        await Incident.create(incidentData);
      }
      setIsFormOpen(false);
      setEditingIncident(null);
      loadData(); // Changed to loadData
    } catch (error) {
      console.error('שגיאה בשמירת תקרית:', error);
    }
  };

  const openNewIncident = () => {
    setEditingIncident(null);
    setIsFormOpen(true);
  };

  const openEditIncident = (incident) => {
    setEditingIncident(incident);
    setIsFormOpen(true);
  };

  const visibleIncidents = getVisibleIncidents(); // Use visible incidents
  const filteredIncidents = visibleIncidents.filter(incident => {
    if (filter === 'all') return true;
    if (filter === 'open') return !['resolved', 'closed'].includes(incident.status);
    if (filter === 'closed') return ['resolved', 'closed'].includes(incident.status);
    
    // For 'critical' filter, check severity instead of status
    if (filter === 'critical') return incident.severity === 'critical';

    return incident.status === filter;
  });

  const openIncidents = visibleIncidents.filter(i => !['resolved', 'closed'].includes(i.status)).length; // Use visible incidents
  const isAdmin = (currentUser?.role === 'admin' || currentUser?.role === 'owner'); // Added

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE]" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
          <div className="w-full lg:w-auto">
            <PageHeader title="ניהול תקריות" subtitle="תיעוד ומעקב אחרי כל התקריות במסעדה (כולל משוב שלילי מלקוחות)" icon={AlertTriangle} />
            <div className="flex flex-wrap items-center gap-2 lg:gap-4 mt-4">
              <Badge className="bg-red-100 text-red-800 text-xs lg:text-sm px-2 lg:px-3 py-1">
                {openIncidents} תקריות פתוחות
              </Badge>
              <Badge className="bg-green-100 text-green-800 text-xs lg:text-sm px-2 lg:px-3 py-1">
                {visibleIncidents.length - openIncidents} תקריות סגורות
              </Badge>
              {!isAdmin && currentUser && (
                <Badge className="bg-[#F4ECD8] text-[#2E3819] text-xs lg:text-sm px-2 lg:px-3 py-1">
                  מוצגות תקריות לפי הרשאות
                </Badge>
              )}
              <Button onClick={loadData} variant="outline" size="sm" className="text-xs lg:text-sm">
                <RefreshCw className="w-3 h-3 lg:w-4 lg:h-4 ml-1 lg:ml-2" />
                רענן רשימה
              </Button>
              {isAdmin && openIncidents > 0 && (
                <Button
                  variant="outline" size="sm"
                  className="text-xs lg:text-sm border-red-300 text-red-700 hover:bg-red-50"
                  onClick={async () => {
                    if (!window.confirm(`לנקות (לסגור) את כל ${openIncidents} התקריות הפתוחות? תמיד אפשר לפתוח מחדש תקרית בודדת.`)) return;
                    try { const res = await base44.functions.clearAllIncidents(); const r = res?.data || res; alert(`נוקו ${r?.cleared ?? 0} תקריות ✓`); loadData(); }
                    catch (e) { alert('שגיאה: ' + (e?.message || 'unknown')); }
                  }}
                >
                  🧹 נקה את כל התקריות
                </Button>
              )}
            </div>
          </div>
          
          {/* כפתור דיווח - מרכזי במובייל */}
          <div className="w-full lg:w-auto flex justify-center lg:justify-end">
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button 
                    onClick={openNewIncident} 
                    className="bg-red-600 hover:bg-red-700 w-full lg:w-auto text-sm lg:text-base px-4 lg:px-6 py-3 lg:py-2"
                >
                  <Plus className="w-4 h-4 lg:w-5 lg:h-5 ml-2" />
                  דווח תקרית חדשה
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto mx-2 lg:mx-0">
                <DialogHeader>
                  <DialogTitle className="text-lg lg:text-xl">{editingIncident ? 'עריכת תקרית' : 'דיווח תקרית חדשה'}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <IncidentForm
                    incident={editingIncident}
                    onSave={handleSaveIncident}
                    onCancel={() => setIsFormOpen(false)}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters */}
        <Tabs value={filter} onValueChange={setFilter} className="mb-6">
          <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 sm:grid sm:grid-cols-6 sm:w-auto">
            <TabsTrigger value="all" className="text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">הכל</TabsTrigger>
            <TabsTrigger value="open" className="text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">פתוחות</TabsTrigger>
            <TabsTrigger value="in_progress" className="text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">בטיפול</TabsTrigger>
            <TabsTrigger value="resolved" className="text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">נפתרו</TabsTrigger>
            <TabsTrigger value="closed" className="text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">סגורות</TabsTrigger>
            <TabsTrigger value="critical" className="text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">קריטיות</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Incidents Grid */}
        {loading ? (
          <p className="text-center py-8">טוען תקריות...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {filteredIncidents.map(incident => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                onEdit={openEditIncident}
                // Determine if user can edit this specific incident
                canEdit={isAdmin || (currentUser && incident.reported_by === currentUser.email)} // Added canEdit logic
              />
            ))}
          </div>
        )}

        {isAdmin && <div className="mb-6"><IncidentAiAnalysis /></div>}

        {filteredIncidents.length === 0 && !loading && (
          <div className="text-center py-12">
            <AlertTriangle className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">אין תקריות להצגה</h3>
            <p className="text-gray-500">
              {filter === 'all' ? 'עדיין לא דווחו תקריות' : `אין תקריות עם סטטוס ${filter}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <PageGuard pageName="Incidents" pageTitle="ניהול תקריות">
      <IncidentsInner />
    </PageGuard>
  );
}