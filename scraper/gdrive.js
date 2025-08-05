import fs from 'fs';
import path from 'path';

/**
 * Uploads a file to a specific folder in Google Drive.
 * Skips upload if a file of the same name already exists.
 */
export async function uploadFileToDrive(drive, localPath, parentFolderId) {
  const fileName = path.basename(localPath);

  const q = `name='${fileName}' and '${parentFolderId}' in parents and trashed = false`;
  const existing = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (existing.data.files.length > 0) {
    console.log(`⏭️ Already on Drive: ${fileName}`);
    return null;
  }

  const media = {
    mimeType: getMimeType(fileName),
    body: fs.createReadStream(localPath),
  };

  const fileMetadata = {
    name: fileName,
    parents: [parentFolderId],
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
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

/**
 * Recursively create a folder if needed within a parent folder in Drive.
 */
export async function createOrGetFolder(drive, parentId, folderName) {
  const q = `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (res.data.files.length > 0) return res.data.files[0].id;

  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };

  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id',
    supportsAllDrives: true,
  });

  return folder.data.id;
}

/**
 * Upload multiple files to a nested path under a base folder.
 */
export async function uploadFilesToDrive(localFiles = [], drive, baseFolderId, keywordType, keywordValue) {
  const folderName = `${keywordType}_${keywordValue}`.replace(/\s+/g, '_');
  const appSpaceFolderId = await createOrGetFolder(drive, baseFolderId, "Anshul's App Space");
const linkedInFolderId = await createOrGetFolder(drive, appSpaceFolderId, 'LinkedInScrapes');
const keywordFolderId = await createOrGetFolder(drive, linkedInFolderId, `${keywordType}_${keywordValue}`.replace(/\s+/g, '_'));
const rawSubFolderId = await createOrGetFolder(drive, keywordFolderId, 'raw');


  for (const file of localFiles) {
    try {
      // USE this rawSubFolderId, do NOT ignore it
      await uploadFileToDrive(drive, file, rawSubFolderId);
    } catch (err) {
      console.warn(`❌ Failed to upload ${file}: ${err.message}`);
    }
  }
}

