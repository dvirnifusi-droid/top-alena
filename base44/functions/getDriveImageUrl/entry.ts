import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const fileId = body.file_id;
    if (!fileId) return Response.json({ error: 'file_id required' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Download the file content
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) return Response.json({ error: 'Failed to fetch file' }, { status: 400 });

    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to base64
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);
    const mimeType = blob.type || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Upload to Base44 storage
    const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({
      file: dataUrl
    });

    return Response.json({ url: uploadRes.file_url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});