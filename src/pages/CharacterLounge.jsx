import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Send, Coins, ChevronRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageGuard from '@/components/shared/PageGuard';
import CoinTransferDialog from '@/components/gamification/CoinTransferDialog';

export default function CharacterLounge() {
  const [employees, setEmployees] = useState([]);
  const [apparelMap, setApparelMap] = useState({});
  const [coinsMap, setCoinsMap] = useState({});
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshCoins = async () => {
    try {
      const transactions = await base44.entities.CoinTransaction.list();
      const coinsByEmp = {};
      employees.forEach(emp => {
        const empTransactions = transactions.filter(t => t.employee_id === emp.id);
        const totalCoins = empTransactions.reduce((sum, t) => {
          if (t.status === 'approved') {
            return sum + (t.amount || 0);
          }
          return sum;
        }, 0);
        coinsByEmp[emp.id] = Math.max(0, totalCoins);
      });
      setCoinsMap(coinsByEmp);
    } catch (error) {
      console.error('Failed to refresh coins:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);

        const [empList, apparel, transactions] = await Promise.all([
          base44.entities.Employee.list(),
          base44.entities.EmployeeApparel.list(),
          base44.entities.CoinTransaction.list()
        ]);

        setEmployees(empList);

        const apparelByEmp = {};
        apparel.forEach(a => {
          apparelByEmp[a.employee_id] = a;
        });
        setApparelMap(apparelByEmp);

        const coinsByEmp = {};
        empList.forEach(emp => {
          const empTransactions = transactions.filter(t => t.employee_id === emp.id);
          const totalCoins = empTransactions.reduce((sum, t) => {
            if (t.status === 'approved') {
              return sum + (t.amount || 0);
            }
            return sum;
          }, 0);
          coinsByEmp[emp.id] = Math.max(0, totalCoins);
        });
        
        setCoinsMap(coinsByEmp);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load character lounge data:', error);
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to EmployeeApparel updates only
    const unsubscribeApparel = base44.entities.EmployeeApparel.subscribe((event) => {
      if (event.type === 'create' || event.type === 'update') {
        setApparelMap(prev => ({
          ...prev,
          [event.data.employee_id]: event.data
        }));
      }
    });

    // Subscribe to CoinTransaction updates
    const unsubscribeCoins = base44.entities.CoinTransaction.subscribe(() => {
      refreshCoins();
    });

    return () => {
      unsubscribeApparel();
      unsubscribeCoins();
    };
  }, []);

  if (loading) {
    return (
      <PageGuard title="סלון דמויות">
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">טוען...</p>
        </div>
      </PageGuard>
    );
  }

  return (
    <PageGuard title="סלון דמויות">
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between mb-4">
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="outline" size="sm" className="gap-2">
              <ChevronRight className="w-4 h-4 rotate-180" />
              חזור
            </Button>
          </Link>
        </div>
        
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-2">✨ סלון הדמויות</h1>
          <p className="text-muted-foreground">בואו להכיר את הצוות שלנו ולשתף מטבעות</p>
        </div>

        {/* Background scene */}
        <div 
          className="relative rounded-2xl overflow-hidden p-8 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 min-h-96"
          style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(168, 85, 247, 0.2) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)',
            boxShadow: 'inset 0 0 60px rgba(0, 0, 0, 0.3)'
          }}
        >
          {/* Grid of characters */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {employees.map((emp) => (
              <CharacterCard
                key={emp.id}
                employee={emp}
                apparel={apparelMap[emp.id]}
                coins={coinsMap[emp.id] || 0}
                isCurrentUser={currentUser?.email === emp.email}
                onSelect={() => {
                  setSelectedEmployee(emp);
                  setShowDetailModal(true);
                }}
              />
            ))}
          </div>
        </div>

        {/* Character Detail Modal */}
        {selectedEmployee && showDetailModal && (
          <CharacterDetailModal
            employee={selectedEmployee}
            apparel={apparelMap[selectedEmployee.id]}
            coins={coinsMap[selectedEmployee.id] || 0}
            isCurrentUser={currentUser?.email === selectedEmployee.email}
            onClose={() => {
              setShowDetailModal(false);
              setSelectedEmployee(null);
            }}
            onTransfer={() => {
              setShowDetailModal(false);
              setShowTransferDialog(true);
            }}
            currentUser={currentUser}
          />
        )}

        {/* Info section */}
        <Card className="bg-[#F4ECD8] border-[#E8D9B5]">
          <CardHeader>
            <CardTitle className="text-lg">💡 קצת על סלון הדמויות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            <p>👤 <strong>הדמויות שלכם:</strong> כל דמות משקפת את הבגדים שבחרתם בחנות הבגדים שלנו.</p>
            <p>🪙 <strong>שיתוף מטבעות:</strong> תוכלו להעביר מטבעות לחברים לצוות כדי לעזור להם לקנות בגדים חדשים.</p>
            <p>🎮 <strong>משחקים עתידיים:</strong> בקרוב נוכל לשחק משימות ומשחקים ביחד בסלון!</p>
          </CardContent>
        </Card>
      </div>

      {/* Transfer Dialog */}
      {selectedEmployee && (
        <CoinTransferDialog
          open={showTransferDialog}
          onOpenChange={setShowTransferDialog}
          recipientEmployee={selectedEmployee}
          currentUser={currentUser}
        />
      )}
    </PageGuard>
  );
}

function CharacterCard({ employee, apparel, coins, isCurrentUser, onSelect }) {
  const [imgError, setImgError] = React.useState(false);

  return (
    <div className="flex flex-col items-center cursor-pointer group" onClick={onSelect}>
      {/* Avatar container */}
      <div className="relative mb-3">
        <div className="w-24 h-32 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg hover:shadow-2xl transition-all duration-300 group-hover:scale-110">
          {apparel?.avatar_url && !imgError ? (
            <img 
              src={apparel.avatar_url} 
              alt={employee.full_name}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="text-5xl">{employee.full_name.trim().charAt(0)}</div>
          )}
        </div>
        {isCurrentUser && (
          <div className="absolute -top-2 -right-2 bg-yellow-400 text-white text-xs font-bold px-2 py-1 rounded-full">
            אתה
          </div>
        )}
      </div>

      {/* Name */}
      <h3 className="text-sm font-bold text-white text-center mb-1 line-clamp-2">
        {employee.full_name.trim()}
      </h3>

      {/* Coins display */}
      <div className="flex items-center gap-1 bg-yellow-500 px-2 py-1 rounded-full mb-3 text-xs font-bold text-white">
        <Coins className="w-3 h-3" />
        {coins}
      </div>
    </div>
  );
}

function CharacterDetailModal({ employee, apparel, coins, isCurrentUser, onClose, onTransfer, currentUser }) {
  const [imgError, setImgError] = React.useState(false);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-gray-200 hover:bg-gray-300 rounded-full p-2 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Large avatar */}
        <div className="w-full h-96 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden">
          {apparel?.avatar_url && !imgError ? (
            <img 
              src={apparel.avatar_url} 
              alt={employee.full_name}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="text-9xl">{employee.full_name.trim().charAt(0)}</div>
          )}
        </div>

        {/* Info section */}
        <div className="p-6 space-y-4">
          {/* Name and title */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{employee.full_name.trim()}</h2>
            {isCurrentUser && (
              <p className="text-sm text-yellow-600 font-semibold">👤 זה אתה</p>
            )}
          </div>

          {/* Coins display */}
          <div className="bg-[#FAF5E8] border-2 border-[#D9BD83] rounded-xl p-4">
            <p className="text-sm text-gray-600 mb-1">מטבעות זמינים</p>
            <div className="flex items-center gap-2">
              <Coins className="w-6 h-6 text-yellow-500" />
              <span className="text-3xl font-bold text-gray-900">{coins}</span>
            </div>
          </div>

          {/* Action button */}
          {!isCurrentUser && (
            <Button
              onClick={onTransfer}
              className="w-full bg-gradient-to-r from-[#A04A2E] to-[#A04A2E] hover:from-[#A04A2E] hover:to-[#7A3722] text-white py-6"
            >
              <Send className="w-5 h-5 mr-2" />
              שלח מטבעות
            </Button>
          )}

          {isCurrentUser && (
            <div className="bg-[#F4ECD8] border-2 border-[#D9BD83] rounded-xl p-4 text-center">
              <p className="text-sm text-[#2E3819]">זה הקרדיט שלך שאתה יכול להשתמש בו</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}