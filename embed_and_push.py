# embed_and_push.py
# Embeds locally summarized JSON files using sentence-transformers and pushes to ChromaDB

import os
import json
from pathlib import Path
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import hashlib
import math

# Load local embedding model
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
model = SentenceTransformer(EMBED_MODEL_NAME)

# Initialize ChromaDB client and collection
client = chromadb.Client(Settings(chroma_db_impl="duckdb", persist_directory=".chromadb_store"))
COLLECTION_NAME = "linkedin_posts"
collection = client.get_or_create_collection(COLLECTION_NAME)

def compute_rank_score(score: float) -> float:
    return min(1.0, math.log(score + 1) / 5) if score else 0.0

def hash_id(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]

def process_summaries(summary_dir: str):
    for file in Path(summary_dir).glob("*.json"):
        with open(file, 'r') as f:
            data = json.load(f)

        summary = data.get("summary")
        if not summary:
            print(f"⚠️ Skipping {file.name}: No summary found.")
            continue

        doc_id = hash_id(data.get("url", file.name))
        embedding = model.encode(summary)

        metadata = {
            "filename": file.name,
            "keyword": data.get("keyword"),
            "url": data.get("url"),
            "timestamp": data.get("timestamp"),
            "engagementScore": data.get("engagementScore", 0),
            "rankScore": compute_rank_score(data.get("engagementScore", 0))
        }

        collection.upsert(
            documents=[summary],
            embeddings=[embedding],
            ids=[doc_id],
            metadatas=[metadata]
        )
        print(f"✅ Inserted into ChromaDB: {file.name}")

if __name__ == "__main__":
    SUMMARY_JSON_DIR = "./data/summaries/ai-startup"   # Update for each keyword
    process_summaries(SUMMARY_JSON_DIR)