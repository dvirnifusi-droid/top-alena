import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FOLDER_ID = '19gPH0jJT8BdbzYvx-sSiFXRhWqo-z_bA';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // Allow both authenticated users (admin) and internal automation calls
    let isAutomation = false;
    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }
    } catch {
        // Called from automation (no user session)
        isAutomation = true;
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
        return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
    }

    // Get Google Drive access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // List all supported files in the folder (PDF, Word, Excel)
    const mimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/msword', // .doc
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel' // .xls
    ];
    const mimeQuery = mimeTypes.map(m => `mimeType='${m}'`).join(' or ');
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+(${mimeQuery})+and+trashed=false&fields=files(id,name,mimeType)&pageSize=50`;
    const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listData = await listRes.json();
    const files = listData.files || [];

    if (files.length === 0) {
        return Response.json({ error: 'No PDF files found in folder' }, { status: 404 });
    }

    const results = [];

    for (const file of files) {
        // Download file from Drive
        const downloadRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const fileBytes = await downloadRes.arrayBuffer();

        // Upload to Gemini File API
        const uploadRes = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': file.mimeType,
                    'X-Goog-Upload-Command': 'upload, finalize',
                    'X-Goog-Upload-Header-Content-Length': fileBytes.byteLength,
                    'X-Goog-Upload-Header-Content-Type': file.mimeType,
                },
                body: fileBytes
            }
        );
        const uploadData = await uploadRes.json();
        const geminiUri = uploadData.file?.uri;

        if (!geminiUri) {
            results.push({ file: file.name, status: 'error', error: JSON.stringify(uploadData) });
            continue;
        }

        // Update or create in GeminiFileCache
        const existing = await base44.asServiceRole.entities.GeminiFileCache.filter({ drive_file_id: file.id });
        if (existing.length > 0) {
            await base44.asServiceRole.entities.GeminiFileCache.update(existing[0].id, {
                gemini_file_uri: geminiUri,
                last_uploaded: new Date().toISOString()
            });
        } else {
            await base44.asServiceRole.entities.GeminiFileCache.create({
                drive_file_id: file.id,
                file_name: file.name,
                gemini_file_uri: geminiUri,
                mime_type: file.mimeType,
                last_uploaded: new Date().toISOString()
            });
        }

        results.push({ file: file.name, status: 'ok', uri: geminiUri });
    }

    return Response.json({ success: true, files: results });
});