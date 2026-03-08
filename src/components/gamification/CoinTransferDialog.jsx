import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coins, AlertCircle } from 'lucide-react';
import { useState as useReactState } from 'react';

export default function CoinTransferDialog({
  open,
  onOpenChange,
  recipientEmployee,
  currentUser,
}) {
  const [amount, setAmount] = useState('');
  const [currentUserCoins, setCurrentUserCoins] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open && currentUser) {
      loadCurrentUserCoins();
    }
  }, [open, currentUser]);

  const loadCurrentUserCoins = async () => {
    try {
      const transactions = await base44.entities.CoinTransaction.filter({
        employee_id: currentUser.id,
      });
      const total = transactions.reduce((sum, t) => {
        if (t.status === 'approved') {
          return sum + (t.amount || 0);
        }
        return sum;
      }, 0);
      setCurrentUserCoins(Math.max(0, total));
    } catch (err) {
      console.error('Failed to load coins:', err);
    }
  };

  const handleTransfer = async () => {
    setError('');
    setSuccess(false);

    const numAmount = parseInt(amount);
    if (!numAmount || numAmount <= 0) {
      setError('יש להזין כמות חיובית');
      return;
    }

    if (numAmount > currentUserCoins) {
      setError('אין לך מספיק מטבעות');
      return;
    }

    setLoading(true);
    try {
      // Create transaction for sender (debit)
      await base44.entities.CoinTransaction.create({
        employee_id: currentUser.id,
        employee_name: currentUser.full_name || currentUser.email,
        amount: -numAmount,
        reason: `העברה ל${recipientEmployee.full_name}`,
        type: 'earned',
        trigger: 'manager_bonus',
        status: 'approved',
      });

      // Create transaction for recipient (credit)
      await base44.entities.CoinTransaction.create({
        employee_id: recipientEmployee.id,
        employee_name: recipientEmployee.full_name,
        amount: numAmount,
        reason: `קיבל מ${currentUser.full_name || currentUser.email}`,
        type: 'earned',
        trigger: 'manager_bonus',
        status: 'approved',
      });

      setSuccess(true);
      setAmount('');
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Transfer failed:', err);
      setError('ההעברה נכשלה, אנא נסה שוב');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>🪙 העברת מטבעות</DialogTitle>
          <DialogDescription>
            שלח מטבעות ל{recipientEmployee.full_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Recipient info */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-gray-700">יעד ההעברה:</p>
            <p className="text-lg font-bold text-blue-700">{recipientEmployee.full_name}</p>
          </div>

          {/* Current coins */}
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-sm font-medium text-gray-700">המטבעות שלך:</p>
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              <span className="text-2xl font-bold text-yellow-700">
                {currentUserCoins}
              </span>
            </div>
          </div>

          {/* Amount input */}
          <div className="space-y-2">
            <Label htmlFor="amount">כמות מטבעות להעברה</Label>
            <Input
              id="amount"
              type="number"
              placeholder="הזן כמות..."
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading || success}
              min="1"
              max={currentUserCoins}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="flex gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-2xl">✅</span>
              <p className="text-sm text-green-700">
                העברה בוצעה בהצלחה! {amount} מטבעות נשלחו ל{recipientEmployee.full_name}
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="flex-1"
              disabled={loading}
            >
              ביטול
            </Button>
            <Button
              onClick={handleTransfer}
              className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
              disabled={loading || !amount || success}
            >
              {loading ? 'שולח...' : 'שלח'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}