import { base44 } from '@/api/base44Client';
export const sendSms = (payload) => base44.functions.sendSms(payload);

