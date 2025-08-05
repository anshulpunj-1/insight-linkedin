# research_for_rank.py

from chromadb.config import Settings
from chromadb import PersistentClient
from config import CHROMA_PATH
from summarize_category import summarize_category
from collections import defaultdict
import os
from urllib.parse import quote

# Init Chroma client
chroma = PersistentClient(path=CHROMA_PATH)
collection = chroma.get_or_create_collection(name="linkedin-posts")
results = collection.get(include=["documents", "metadatas"])

total_docs = len(results["documents"])
print(f"\n✅ Total documents fetched: {total_docs}")
if total_docs == 0:
    print("❌ No documents found in collection. Did you run the ingestion?")
    exit(1)

by_category = defaultdict(list)

for doc, meta in zip(results["documents"], results["metadatas"]):
    cat = meta.get("category", "Uncategorized")
    score = int(meta.get("engagementScore", 0))
    url = meta.get("post_url") or ""
    if not url:
        urn = meta.get("filename", "").replace(".txt", "")
        if urn.startswith("urn_li_activity_"):
            activity_id = urn.replace("urn_li_activity_", "").split("_")[0]
            url = f"https://www.linkedin.com/feed/update/urn:li:activity:{activity_id}"
            meta["post_url"] = url
    if len(doc.strip()) < 30 or not url:
        print(f"⏩ Skipping doc (short or no URL): {meta.get('filename')}")
        continue
    by_category[cat].append((score, doc, meta))

print(f"\n[INFO] Categories found:")
for cat in by_category:
    if cat != "Uncategorized":
        print(f"- {cat}: {len(by_category[cat])} posts")

# Digest build
digest_lines = ["# 📬 Weekly AI & Startup Digest\n"]
imp_notes = ["## 📌 🔹 Top Insights\n"]

def anchor_from_category(cat):
    return quote(cat.lower().replace(" ", "-")).replace("/", "-")

for category, items in by_category.items():
    if category == "Uncategorized" or len(items) == 0:
        continue

    top_docs = sorted(items, reverse=True)[:5]
    summary, actions = summarize_category(category, top_docs)

    if not summary:
        continue

    # Extract 1-line summary from first bullet
    bullet_lines = [line.strip() for line in summary.splitlines() if line.strip().startswith("-")]
    first_bullet = bullet_lines[0] if bullet_lines else "Insight not available"
    imp_notes.append(f"- **{category}:** {first_bullet} [⬇ Go → {category}](#{anchor_from_category(category)})")

    digest_lines.append(f"\n## 🗂 {category}")
    title_line = ""
    for line in summary.splitlines():
        if "**🔍 Title:**" in line:
            title_line = line.replace("**🔍 Title:**", "").strip()
            break
    digest_lines.append(f"**🔍 Title:** {title_line}")

    digest_lines.append("\n**📌 Insight Bullets:**")
    inside_bullets = False
    for line in summary.splitlines():
        if line.strip().startswith("**📌 Insight Bullets:**"):
            inside_bullets = True
            continue
        if inside_bullets and line.strip().startswith("**"):
            break
        if inside_bullets:
            digest_lines.append(line)

    digest_lines.append("\n**🧠 Takeaway:**")
    for line in actions.splitlines():
        if line.strip().startswith("-"):
            digest_lines.append(line)

    digest_lines.append("\n**Top Posts:**")
    for _, _, meta in top_docs:
        url = meta.get("post_url", "")
        digest_lines.append(f"- **Feed post** — [LinkedIn User]({url})")

# Final write
if imp_notes:
    digest_lines.insert(1, "\n".join(imp_notes))

os.makedirs("email_digest", exist_ok=True)
digest_path = "email_digest/weekly_digest.md"
with open(digest_path, "w", encoding="utf-8") as f:
    f.write("\n".join(digest_lines))
print(f"\n✅ Weekly digest saved to: {digest_path}")