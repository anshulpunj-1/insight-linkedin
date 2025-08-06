# config.py
CHROMA_PATH = "chroma_db"
CHROMA_COLLECTION_NAME = "linkedin_insights"
OLLAMA_MODEL = "mistral"
RAW_OUTPUT_FOLDER = "output"
TOP_K_PER_CATEGORY = 3
EMAILS = {
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 465,
    "smtp_user": "anshul@intavo.com",        # ✅ your Gmail
    "smtp_pass": "whtopvaopbtcavrf",           # ✅ 16-char Gmail App Password
    "recipients": [
        "anshul@intavo.com"              # ✅ Can be list of emails
        
    ]
}

import os

CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma-db")