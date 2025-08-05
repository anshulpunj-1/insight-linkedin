import stream from 'stream';


/**
 * Ensures the folder path exists in Google Drive inside the specified root folder ID.
 * Creates nested folders if needed.
 */
export async function ensureDriveFolderPath(drive, folderPath, rootFolderId = 'root') {
  const parts = folderPath.split('/').filter(Boolean);
  let parentId = rootFolderId;

  for (const part of parts) {
    const folderId = await getDriveFolderIdByName(drive, part, parentId);
    if (folderId) {
      parentId = folderId;
    } else {
      const res = await drive.files.create({
        requestBody: {
          name: part,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      parentId = res.data.id;
    }
  }

  return parentId;
}

async function getDriveFolderIdByName(drive, folderName, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id || null;
}

export async function getDriveFileIdByName(drive, fileName, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${fileName}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id || null;
}

export async function listFilesInFolder(drive, parentId, foldersOnly = false) {
  const query = `'${parentId}' in parents and trashed = false` +
    (foldersOnly ? " and mimeType = 'application/vnd.google-apps.folder'" : '');

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files || [];
}

export async function downloadTextFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );
  return await streamToString(res.data);
}

function streamToString(streamData) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    streamData.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    streamData.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    streamData.on('error', reject);
  });
}
