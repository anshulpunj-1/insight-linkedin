import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { google } from 'googleapis';

export async function uploadFileToDrive(localPath, driveFolderId = null) {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const authClient = await auth.getClient();

  const drive = google.drive({ version: 'v3', auth: authClient });

  const fileMetadata = {
    name: path.basename(localPath),
    ...(driveFolderId ? { parents: [driveFolderId] } : {})
  };

  const media = {
    mimeType: mime.lookup(localPath) || 'application/octet-stream',
    body: fs.createReadStream(localPath),
  };

  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, webViewLink, webContentLink',
    supportsAllDrives: true,   // <--- Add this
  });

  console.log(`📤 Uploaded to Google Drive: ${res.data.name}`);
  return res.data;
}