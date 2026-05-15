import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const folderId = body.folder_id || 'root';

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // List files in folder - images only
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
      fields: 'files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,modifiedTime)',
      pageSize: '50',
      orderBy: 'modifiedTime desc'
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();

    // Also list subfolders
    const folderParams = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      pageSize: '20'
    });
    const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?${folderParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const folderData = await folderRes.json();

    return Response.json({
      images: data.files || [],
      folders: folderData.files || []
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});