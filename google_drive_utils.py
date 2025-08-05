# google_drive_utils.py
from googleapiclient.discovery import build
from google.oauth2 import service_account

SCOPES = ['https://www.googleapis.com/auth/drive']
SERVICE_ACCOUNT_FILE = 'keys/service-account.json'

def get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return build('drive', 'v3', credentials=creds)

def get_drive_service():
    creds = None
    if os.path.exists("token.pkl"):
        with open("token.pkl", "rb") as f:
            creds = pickle.load(f)
    else:
        flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
        creds = flow.run_local_server(port=0)
        with open("token.pkl", "wb") as f:
            pickle.dump(creds, f)

    return build("drive", "v3", credentials=creds)

drive = get_drive_service()

def list_drive_files(parent_folder_id, mime_types=None):
    q = f"'{parent_folder_id}' in parents and trashed = false"
    if mime_types:
        mime_filter = " or ".join([f"mimeType='{mt}'" for mt in mime_types])
        q += f" and ({mime_filter})"

    results = drive.files().list(q=q, fields="files(id, name, mimeType)").execute()
    return results.get("files", [])

def download_file_content(file_id):
    request = drive.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while done is False:
        status, done = downloader.next_chunk()
    fh.seek(0)
    return fh.read().decode("utf-8")