import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Send, Coins, ChevronRight } from 'lucide-react';
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
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);

        const empList = await base44.entities.Employee.list();
        setEmployees(empList);

        // Load apparel for all employees
        const apparel = await base44.entities.EmployeeApparel.list();
        const apparelByEmp = {};
        
        apparel.forEach(a => {
          apparelByEmp[a.employee_id] = a;
        });
        setApparelMap(apparelByEmp);

        // Load coins for all employees
        const transactions = await base44.entities.CoinTransaction.list();
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

    // Subscribe to EmployeeApparel updates
    const unsubscribeApparel = base44.entities.EmployeeApparel.subscribe((event) => {
      if (event.type === 'update') {
        console.log('Apparel updated:', event.data);
        setApparelMap(prev => ({
          ...prev,
          [event.data.employee_id]: event.data
        }));
      }
    });

    // Subscribe to CoinTransaction updates
    const unsubscribeCoins = base44.entities.CoinTransaction.subscribe((event) => {
      if (event.type === 'create' || event.type === 'update') {
        setCoinsMap(prev => {
          const updated = { ...prev };
          const transactions = [];
          // Reload all transactions (simplified - in production could be more efficient)
          base44.entities.CoinTransaction.list().then(txns => {
            employees.forEach(emp => {
              const empTransactions = txns.filter(t => t.employee_id === emp.id);
              const totalCoins = empTransactions.reduce((sum, t) => {
                if (t.status === 'approved') {
                  return sum + (t.amount || 0);
                }
                return sum;
              }, 0);
              updated[emp.id] = Math.max(0, totalCoins);
            });
            setCoinsMap(updated);
          });
          return prev;
        });
      }
    });

    return () => {
      unsubscribeApparel();
      unsubscribeCoins();
    };
  }, [employees]);

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
                  setShowTransferDialog(true);
                }}
              />
            ))}
          </div>
        </div>

        {/* Info section */}
        <Card className="bg-blue-50 border-blue-200">
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
  useEffect(() => {
    if (apparel?.employee_id) {
      console.log(`Employee: ${employee.full_name}, Apparel exists: ${!!apparel}, Has avatar_url: ${!!apparel?.avatar_url}, URL: ${apparel?.avatar_url}`);
    }
  }, [apparel, employee.full_name]);

  return (
    <div className="flex flex-col items-center cursor-pointer group" onClick={onSelect}>
      {/* Avatar container */}
      <div className="relative mb-3">
        <div className="w-24 h-32 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg hover:shadow-2xl transition-all duration-300 group-hover:scale-110">
          {apparel?.avatar_url ? (
            <img 
              src={apparel.avatar_url} 
              alt={employee.full_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-5xl">{employee.full_name.charAt(0)}</div>
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
        {employee.full_name}
      </h3>

      {/* Coins display */}
      <div className="flex items-center gap-1 bg-yellow-500 px-2 py-1 rounded-full mb-3 text-xs font-bold text-white">
        <Coins className="w-3 h-3" />
        {coins}
      </div>

      {/* Transfer button */}
      {!isCurrentUser && (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          size="sm"
          className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white text-xs"
        >
          <Send className="w-3 h-3 mr-1" />
          שלח מטבעות
        </Button>
      )}
    </div>
  );
}