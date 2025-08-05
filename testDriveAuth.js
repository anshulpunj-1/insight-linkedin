// uploadTest.js
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import dotenv from 'dotenv';

dotenv.config();

async function uploadTestFile() {
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  const folderId = process.env.DRIVE_FOLDER_ID;
  const filePath = 'test_upload.txt';
  const fileName = path.basename(filePath);

  console.log(`🧪 Uploading: ${fileName}, mime: ${mime.lookup(filePath)}`);

  const res = await drive.files.create({
     requestBody: {
    name: 'test_upload.txt',
    parents: ['1RG_7Bknb4wbNVFOxo3NsTNRc_OvfWJyT'], // same one
  },
  media: {
    mimeType: 'text/plain',
    body: fs.createReadStream('test_upload.txt'),
  },
  fields: 'id, name, webViewLink',
  supportsAllDrives: true, // ✅ Must include this
});


  console.log(`✅ Uploaded test file → ${res.data.webViewLink}`);
}

uploadTestFile();