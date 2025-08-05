# cli_query.py
# CLI tool for querying ChromaDB and logging query metadata for retraining feedback

import json
import os
from datetime import datetime
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import operator

# Initialize embedding model
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
model = SentenceTransformer(EMBED_MODEL_NAME)

# ChromaDB client setup
client = chromadb.Client(Settings(chroma_db_impl="duckdb", persist_directory=".chromadb_store"))
collection = client.get_or_create_collection("linkedin_posts")

# Log file for query history and feedback
LOG_DIR = "./logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "query_log.jsonl")

def log_query(query: str, results: list):
    timestamp = datetime.utcnow().isoformat()
    for result in results:
        log_entry = {
            "timestamp": timestamp,
            "query": query,
            "matched_summary": result["document"],
            "metadata": result["metadata"],
            "feedback": None  # to be filled manually later or via UI
        }
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(log_entry) + "\n")

def search_query(query: str, top_k: int = 5, min_rank: float = 0.0, keyword_filter: str = None):
    embedded = model.encode(query)
    results = collection.query(
        query_embeddings=[embedded],
        n_results=top_k * 2,
        where={"keyword": keyword_filter} if keyword_filter else {}
    )

    matched = []
    for i in range(len(results["ids"][0])):
        doc = results["documents"][0][i]
        metadata = results["metadatas"][0][i]
        if metadata.get("rankScore", 0) >= min_rank:
            matched.append({"document": doc, "metadata": metadata})

    matched.sort(key=lambda x: x["metadata"].get("rankScore", 0), reverse=True)
    matched = matched[:top_k]

    log_query(query, matched)
    return matched

def cli():
    print("🔍 Semantic Search CLI (ChromaDB + Local Embeddings)")
    print("Type 'exit' to quit.\n")

    while True:
        q = input("🔹 Enter your query: ").strip()
        if q.lower() in ["exit", "quit"]:
            print("👋 Exiting.")
            break

        results = search_query(q)
        print("\n📄 Top Results:\n")
        for idx, res in enumerate(results, 1):
            print(f"[{idx}] Summary: {res['document'][:300]}...")
            print(f"     URL: {res['metadata'].get('url')}")
            print(f"     Score: {res['metadata'].get('rankScore'):.2f}  | Keyword: {res['metadata'].get('keyword')}\n")

if __name__ == "__main__":
    cli()
