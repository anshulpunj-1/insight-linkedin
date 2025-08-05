import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { google } from 'googleapis';

export async function uploadFileToDrive(localPath, driveFolderId = null) {
  const drive = await authorize();

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
  });

  console.log(`📤 Uploaded to Google Drive: ${res.data.name}`);
  return res.data;
}