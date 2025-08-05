# vector/email_digest/send_email.py

import smtplib
from email.message import EmailMessage
import os
from config import EMAILS

DIGEST_FILE = "email_digest/weekly_digest.txt"

def send_email_digest():
    if not os.path.exists(DIGEST_FILE):
        print("❌ Digest file not found:", DIGEST_FILE)
        return

    with open(DIGEST_FILE, "r", encoding="utf-8") as f:
        body = f.read().strip()

    if not body:
        print("⚠️ Digest file is empty. Nothing to send.")
        return

    msg = EmailMessage()
    msg["Subject"] = "📬 Weekly LinkedIn Insight Digest"
    msg["From"] = EMAILS["smtp_user"]
    msg["To"] = ", ".join(EMAILS["recipients"])
    msg.set_content(body)

    try:
        with smtplib.SMTP_SSL(EMAILS["smtp_host"], EMAILS["smtp_port"]) as smtp:
            smtp.login(EMAILS["smtp_user"], EMAILS["smtp_pass"])
            smtp.send_message(msg)
        print("✅ Email digest sent successfully.")
    except Exception as e:
        print("❌ Failed to send email:", e)


if __name__ == "__main__":
    send_email_digest()