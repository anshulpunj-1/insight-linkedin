import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

/**
 * Uploads files to nested Google Drive structure:
 * SHARED_DRIVE → APP_SPACE_FOLDER → LinkedInScrapes → <keywordType_keywordValue> → raw
 */
export async function uploadFilesToDrive(localFiles, drive, appSpaceFolderId, keywordType, keywordValue) {
  const folderName = `${keywordType}_${keywordValue}`.replace(/\s+/g, '_');

  console.log('🧩 Upload debug info →', {
    appSpaceFolderId,
    keywordType,
    keywordValue,
    folderName,
    localFiles,
  });

  if (!appSpaceFolderId) {
    throw new Error('❌ APP_SPACE_FOLDER_ID not set');
  }

  // Step-by-step create folders inside APP_SPACE_FOLDER
  const linkedInFolderId = await createOrGetFolder(drive, appSpaceFolderId, 'LinkedInScrapes');
  const keywordFolderId = await createOrGetFolder(drive, linkedInFolderId, folderName);
  const rawSubFolderId = await createOrGetFolder(drive, keywordFolderId, 'raw');

  if (!rawSubFolderId) {
    throw new Error('❌ Could not resolve raw folder inside Google Drive');
  }

  for (const file of localFiles) {
    if (!fs.existsSync(file)) {
      console.warn(`⚠️ File not found: ${file}`);
      continue;
    }

    const fileName = path.basename(file);
    const mimeType = mime.lookup(file) || 'application/octet-stream';

    const fileMetadata = {
      name: fileName,
      parents: [rawSubFolderId],
    };

    const media = {
      mimeType,
      body: fs.createReadStream(file),
    };

    try {
      const res = await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
      });

      console.log(`☁️ Uploaded → ${res.data.name} | ${res.data.webViewLink}`);
    } catch (err) {
      console.error(`❌ Failed to upload ${fileName}:`, err.message);
    }
  }
}

/**
 * Ensures a folder exists or creates it.
 */
async function createOrGetFolder(drive, parentId, folderName) {
  const query = `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    spaces: 'drive',
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };

  const folder = await drive.files.create({
    requestBody: folderMetadata,
    fields: 'id',
    supportsAllDrives: true,
  });

  console.log(`📁 Created folder: ${folderName} → ${folder.data.id}`);
  return folder.data.id;
}