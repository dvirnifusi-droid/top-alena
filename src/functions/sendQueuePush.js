import { base44 } from '@/api/base44Client';
export const sendQueuePush = (payload) => base44.functions.sendQueuePush(payload);

