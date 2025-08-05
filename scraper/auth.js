import { google } from 'googleapis';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const KEYFILEPATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve('./keys/service-account.json');

export async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: SCOPES,
  });

  const authClient = await auth.getClient();

  // ✅ Return DRIVE instance directly
  return google.drive({ version: 'v3', auth: authClient });
}