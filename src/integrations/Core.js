import { base44 } from '@/api/base44Client';

export const {
  UploadFile,
  SendEmail,
  InvokeLLM,
  GenerateImage,
  ExtractDataFromUploadedFile,
  CreateFileSignedUrl,
} = base44.integrations.Core;

export default base44.integrations.Core;
