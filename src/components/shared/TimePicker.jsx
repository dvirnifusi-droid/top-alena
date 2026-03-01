import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

export default function TimePicker({ value, onChange }) {
  const [hour = '00', minute = '00'] = value ? value.split(':') : [];

  const handleHourChange = (newHour) => {
    onChange(`${newHour}:${minute}`);
  };
  
  const handleMinuteChange = (e) => {
    let newMinuteValue = e.target.value;
    
    // Allow clearing the input
    if (newMinuteValue === '') {
        onChange(`${hour}:00`); // Default to 00 if cleared, or you could leave it empty and validate on blur
        return;
    }

    let num = parseInt(newMinuteValue, 10);
    
    if (!isNaN(num)) {
        if (num > 59) num = 59;
        if (num < 0) num = 0;
        
        const formattedMinute = num.toString().padStart(2, '0');
        onChange(`${hour}:${formattedMinute}`);
    }
  };

  const handleMinuteBlur = (e) => {
    const currentMinute = e.target.value;
    if (currentMinute === '' || isNaN(parseInt(currentMinute, 10))) {
        onChange(`${hour}:00`);
    } else {
        const numMinute = parseInt(currentMinute, 10);
        onChange(`${hour}:${numMinute.toString().padStart(2, '0')}`);
    }
  };

  return (
    <div className="flex flex-row-reverse gap-2">
      <Select value={hour} onValueChange={handleHourChange}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="שעה" />
        </SelectTrigger>
        <SelectContent>
          {hours.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        type="number"
        value={minute}
        onChange={handleMinuteChange}
        onBlur={handleMinuteBlur}
        className="flex-1 text-center"
        placeholder="דקות"
        min="0"
        max="59"
      />
    </div>
  );
}