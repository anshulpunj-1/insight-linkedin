// driveUtils.js (ESM-compatible)
import { google } from 'googleapis';

/**
 * Recursively create folder path in Drive like: base/keyword/raw
 */
export async function createOrGetFolder(drive, parentFolderId, ...folderNames) {
  let currentFolderId = parentFolderId;

  for (const name of folderNames) {
    const searchQuery = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${currentFolderId}' in parents and trashed=false`;

    const res = await drive.files.list({
      q: searchQuery,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (res.data.files.length > 0) {
      currentFolderId = res.data.files[0].id;
    } else {
      const newFolder = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentFolderId],
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      currentFolderId = newFolder.data.id;
    }
  }

  return currentFolderId;
}
export const ensureDriveFolderPath = createOrGetFolder;
