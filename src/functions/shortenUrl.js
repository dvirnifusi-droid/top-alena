import { base44 } from '@/api/base44Client';
export const shortenUrl = (payload) => base44.functions.shortenUrl(payload);

