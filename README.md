 LinkedIn Scraper with AI Summary, OCR, Google Drive, and Notion Sync

📌 Overview

A production-grade LinkedIn scraper that:

Logs in using li_at cookie (LinkedIn session)

Extracts full post content including slides (document carousels)

Runs OCR on images/slides to capture hidden insights

Saves outputs as .txt, .json, and .pdf

Categorizes posts by keywords and authors (e.g., "Research")

Pushes files to Google Drive under a structured folder hierarchy

Uploads metadata to Google Sheets

Sends parsed, summarized updates to Notion

Supports vector embedding for downstream retrieval

🏗️ Project Structure

linkedin-scraper/
├── scraper/                                # Core scraping logic
│   ├── linkedinScraper.js
│   ├── driveUtils.js
│   ├── generateMetadataText.js
│   ├── saveStructuredPdf.js
│   ├── notionPushUtils.js
│   ├── vectorUtils.js
├── vector/                                 # Vector embedding and config
│   ├── createSeedConfig.js                # Creates seed config from urls.txt
│   ├── ingest_raw_to_chroma.py           # Push raw content to Chroma
│   ├── research_for_rank.py              # Creates ranked digest for Notion
│   ├── push_to_notion.py                 # Pushes summary blocks to Notion
├── email_digest/
│   └── send_email.py                      # Optional email sender
├── helpers/
│   └── ocr_helper.py
├── output/                                # Scraped files (ignored in git)
├── seed.json                              # Keywords, URLs, and filters
├── urls.txt                               # List of post URLs to seed
├── target_authors.txt                     # Author match rules
├── keywords.txt                           # Keywords list
├── .env.example                           # Environment variable template
├── .gitignore
├── package.json
├── README.md

📁 Google Drive Folder Structure

LinkedInScrapes/
├── Series A-Raw/                        # Raw .txt files (full post content)
├── Research-Raw/                        # Posts by target authors
├── Summary/
│   ├── summaries.json                   # Combined summary of all posts
│   └── summaries.pdf                    # Combined summary (PDF)

🧠 Vector Embedding to Chroma

Each post's content (with optional OCR text) is:

Pushed to vectorUtils.js

Embedded using OpenAI or local model

Stored in ChromaDB under collection name from .env

Example call (inside scraper):

await upsertToChroma({
  content: fullText,
  metadata: { url, author, keyword, category, timestamp }
});

🚀 Usage

1. Install dependencies
npm install

2. Add your credentials
cp .env.example .env

Fill in:
LI_AT_COOKIE=your_li_at_cookie_here
GOOGLE_CREDENTIALS_PATH=credentials.json
CHROMA_COLLECTION_NAME=linkedin_insights
NOTION_API_KEY=...
NOTION_PAGE_ID=...

3. Start the scraper
npm run scrape 

Output Types

Each post generates:

.txt: full content + metadata + OCR

.pdf: stylized version with link 


🚀 Features
✅ Session Cookie Login (li_at) – No need for username/password, avoids 2FA issues.
🤖 LinkedIn Scraping – Searches LinkedIn for public posts by keyword.
🧠 AI Summarization – Summarizes post content using OpenAI's GPT-3.5.
📄 PDF Export – Beautiful summaries PDF with clickable URLs and QR codes.
🔐 Environment-secure – Secrets stored in .env, not hardcoded.
📦 Clean project structure for collaboration and CI.

📦 Prerequisites
Node.js ≥ 18.x
Git
LinkedIn account
Mistral Running locally 
GitHub CLI (optional)


First Login & Cookie Storage
To begin using the scraper, you must perform an initial manual login to LinkedIn via your browser to obtain the li_at session cookie. This cookie represents your active LinkedIn session and allows the scraper to authenticate without requiring your credentials directly.

Steps for first login:

Log into your LinkedIn account via a web browser.

Extract the value of the li_at cookie from your browser's developer tools or a cookie manager extension.

Store this li_at cookie value securely in a .env file as shown in the .env.example template.

The scraper will use this cookie to authenticate future sessions, avoiding the need for username/password login or 2FA.


🤖 Local LLM Option (Mistral via Ollama)

You can run Mistral locally using Ollama:

1. Install Ollama (if not already):
    brew install ollama

2. Pull Mistral model:
    ollama pull mistral

3. Ensure Ollama is running before scraping:
    ollama run mistral