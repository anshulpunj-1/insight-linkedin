# generate_digest.py
import json
from datetime import datetime
from pathlib import Path

DIGEST_PATH = "vector/email_digest/weekly_digest.html"
SOURCE_JSON = "vector/research_output/research_results.json"  # or query Chroma

def generate_html_digest(data):
    html = f"<h2>Weekly LinkedIn Insights Digest – {datetime.today().strftime('%Y-%m-%d')}</h2><hr>"

    for category, posts in data.items():
        html += f"<h3>{category} ({len(posts)} posts)</h3><ul>"
        for post in posts:
            html += f"<li><b>{post['title']}</b><br>"
            html += f"<a href='{post['url']}'>{post['url']}</a><br>"
            html += f"{post['summary'][:300]}...</li><br>"
        html += "</ul><hr>"

    return html

def main():
    if not Path(SOURCE_JSON).exists():
        print(f"❌ Research file not found: {SOURCE_JSON}")
        return

    with open(SOURCE_JSON, "r") as f:
        data = json.load(f)

    html = generate_html_digest(data)
    Path(DIGEST_PATH).write_text(html, encoding="utf-8")
    print(f"✅ Digest generated at: {DIGEST_PATH}")

if __name__ == "__main__":
    main()