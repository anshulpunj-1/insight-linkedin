// utils/gdrive.js

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import readline from 'readline';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = 'token.json';

export async function authorizeDrive() {
  const credentials = JSON.parse(fs.readFileSync('credentials.json'));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('🔐 Authorize this app by visiting this url:\n', authUrl);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('Enter the code from that page here: ', resolve));
  rl.close();

  const token = (await oAuth2Client.getToken(code)).tokens;
  oAuth2Client.setCredentials(token);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
  return oAuth2Client;
}

export async function createOrGetFolder(drive, parentId, folderName) {
  const q = `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });

  if (res.data.files.length > 0) return res.data.files[0].id;

  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  };

  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id'
  });
  return folder.data.id;
}

export async function uploadFileToDrive(drive, auth, localPath, parentFolderId) {
  const fileName = path.basename(localPath);

  // Check if file already exists in folder
  const q = `name='${fileName}' and '${parentFolderId}' in parents and trashed = false`;
  const existing = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });
  if (existing.data.files.length > 0) {
    console.log(`⏭️ Already on Drive: ${fileName}`);
    return null;
  }

  const media = {
    mimeType: getMimeType(fileName),
    body: fs.createReadStream(localPath)
  };
  const fileMetadata = {
    name: fileName,
    parents: [parentFolderId]
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: 'id, name, webViewLink'
  });

  console.log(`☁️ Uploaded: ${res.data.name} → ${res.data.webViewLink}`);
  return res.data;
}

function getMimeType(fileName) {
  if (fileName.endsWith('.pdf')) return 'application/pdf';
  if (fileName.endsWith('.txt')) return 'text/plain';
  if (fileName.endsWith('.json')) return 'application/json';
  if (fileName.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

export async function uploadFilesToDrive(auth, localFiles = [], keywordType, keywordValue) {
  const drive = google.drive({ version: 'v3', auth });
  const baseFolderId = await createOrGetFolder(drive, 'root', 'LinkedInScrapes');
  const folderName = `${keywordType}_${keywordValue}`.replace(/\s+/g, '_');
  const rawFolderId = await createOrGetFolder(drive, baseFolderId, folderName);
  const rawSubFolderId = await createOrGetFolder(drive, rawFolderId, 'raw');

  for (const file of localFiles) {
    try {
      await uploadFileToDrive(drive, auth, file, rawSubFolderId);
    } catch (err) {
      console.warn(`❌ Failed to upload ${file}: ${err.message}`);
    }
  }
}