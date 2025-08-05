# generate_insights.py
# Step 1 in the insights pipeline: Group, rank, and summarize posts by category

import os
import json
from chromadb import Client
from chromadb.config import Settings
from ollama import chat_with_mistral  # Assuming you have ollama setup
from dotenv import load_dotenv

load_dotenv()

CHROMA_PATH = os.getenv("CHROMA_DB_DIR", "vector_store")
client = Client(Settings(persist_directory=CHROMA_PATH))
collection = client.get_collection(name="linkedin-posts")

# ---- Utility Functions ---- #
def group_posts_by_category(docs):
    grouped = {}
    for doc in docs:
        cat = doc['metadata'].get('category', 'Uncategorized')
        grouped.setdefault(cat, []).append(doc)
    return grouped

def rank_posts(posts):
    return sorted(posts, key=lambda x: x['metadata'].get('engagementScore', 0), reverse=True)

def summarize_category(category, posts, top_n=5):
    content_blocks = [p['document'] for p in rank_posts(posts)[:top_n]]
    merged = "\n---\n".join(content_blocks)
    prompt = f"""
You are an AI analyst. Extract weekly insights from the following high-engagement LinkedIn posts in the category: "{category}".
Focus on:
- Emerging trends
- Common tools or platforms
- Key companies or job roles
- Geographical patterns

Posts:
{merged}

Summarize in 5-7 bullet points.
"""
    return chat_with_mistral(prompt)

# ---- Main Logic ---- #
def generate_insight_digest():
    results = collection.get(include=["documents", "metadatas"])
    grouped = group_posts_by_category([
        {"document": d, "metadata": m}
        for d, m in zip(results["documents"], results["metadatas"])
    ])

    insight_digest = {}
    for category, posts in grouped.items():
        print(f"🔍 Generating insight for category: {category} ({len(posts)} posts)")
        summary = summarize_category(category, posts)
        insight_digest[category] = summary

    with open("weekly_insights.json", "w") as f:
        json.dump(insight_digest, f, indent=2)

    print("✅ Weekly insights generated → weekly_insights.json")
    return insight_digest

if __name__ == "__main__":
    generate_insight_digest()