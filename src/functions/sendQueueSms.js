import { base44 } from '@/api/base44Client';
export const sendQueueSms = (payload) => base44.functions.sendQueueSms(payload);

