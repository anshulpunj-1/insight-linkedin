import path from 'path';
import fs from 'fs';

function sanitizeForDriveFolderName(str) {
  return str
    .replace(/[“”‘’"']/g, '')       // remove curly and straight quotes
    .replace(/[^a-zA-Z0-9_\- ]/g, '_') // safe characters only
    .replace(/_+/g, '_')
    .trim();
}

export async function uploadFilesToDrive(
  files,
  drive,
  parentFolderId, // This is your APP_SPACE_FOLDER_ID
  keywordType,
  keywordValue
) {
  console.log(`🚀 uploadFilesToDrive: ${files.length} file(s) for "${keywordValue}"`);

  if (!files || files.length === 0) return;

  const safeKeyword = sanitizeForDriveFolderName(keywordValue);
  const keywordFolderName = `${keywordType}_${safeKeyword}`;

  try {
    // 👇 This creates "LinkedInScrapes" folder inside your AppSpace folder
    const linkedinFolderId = await ensureFolderExists(drive, 'LinkedInScrapes', parentFolderId);

    // 👇 This creates the per-keyword folder inside LinkedInScrapes
    const keywordFolderId = await ensureFolderExists(drive, keywordFolderName, linkedinFolderId);
    console.log(`📁 Keyword folder ensured: ${keywordFolderName} (${keywordFolderId})`);

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      const mimeType = getMimeType(filePath);

      const fileMetadata = {
        name: fileName,
        parents: [keywordFolderId]
      };

      const media = {
        mimeType,
        body: fs.createReadStream(filePath)
      };

      await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id',
        supportsAllDrives: true // ✅ THIS IS CRITICAL FOR SHARED DRIVES
      });

      console.log(`✅ Uploaded: ${fileName} → ${keywordFolderName}`);
    }
  } catch (err) {
    console.error(`❌ Failed to ensure keyword folder:`, err.message);
  }
}

function getMimeType(filePath) {
  if (filePath.endsWith('.txt')) return 'text/plain';
  if (filePath.endsWith('.pdf')) return 'application/pdf';
  if (filePath.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

async function ensureFolderExists(drive, name, parentId) {
  const query = `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  const folder = res.data.files[0];
  if (folder) return folder.id;

  const fileMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  };

  const folderCreate = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
    supportsAllDrives: true // ✅ REQUIRED
  });

  return folderCreate.data.id;
}