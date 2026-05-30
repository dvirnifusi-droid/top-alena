import { base44 } from '@/api/base44Client';
export const sendPushoverNotification = (payload) => base44.functions.sendPushoverNotification(payload);

