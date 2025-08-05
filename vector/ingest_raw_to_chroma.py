# ingest_local_to_chroma.py

import os
import uuid
from chromadb import PersistentClient
from embed_mistral import get_embedding

CHROMA_PATH = "chroma_db"
DATA_ROOT = "../output"

# ✅ New Chroma client
chroma_client = PersistentClient(path=CHROMA_PATH)
collection = chroma_client.get_or_create_collection(name="linkedin-posts")


def extract_body_and_metadata(txt):
    lines = txt.splitlines()
    metadata = {}
    body_lines = []

    in_metadata = False
    in_body = False

    for line in lines:
        if "--- METADATA ---" in line:
            in_metadata = True
            continue
        if "----------------" in line and in_metadata:
            in_metadata = False
            in_body = True
            continue

        if in_metadata:
            if ':' in line:
                key, value = line.split(':', 1)
                metadata[key.strip()] = value.strip()
        elif in_body:
            body_lines.append(line)

    body = "\n".join(body_lines).strip()
    return body, metadata


def load_txt_files():
    for root, dirs, files in os.walk(DATA_ROOT):
        for fname in files:
            if not fname.endswith(".txt") or "urn_li_activity" not in fname:
                continue

            full_path = os.path.join(root, fname)
            with open(full_path, "r", encoding="utf-8") as f:
                raw_text = f.read()
                body, metadata = extract_body_and_metadata(raw_text)

                if len(body) < 30:
                    print(f"⚠️ Skipping short or metadata-only file: {fname}")
                    continue

                yield {
                    "id": str(uuid.uuid5(uuid.NAMESPACE_URL, full_path)),
                    "text": body,
                    "filename": fname,
                    "source": root,
                    "meta": metadata
                }


def already_exists(doc_id):
    try:
        result = collection.get(ids=[doc_id])
        return bool(result['ids'])
    except:
        return False


def ingest():
    count = 0
    for doc in load_txt_files():
        if already_exists(doc["id"]):
            print(f"⏭️ Skipping duplicate: {doc['filename']}")
            continue

        try:
            embedding = get_embedding(doc["text"])
            collection.add(
                documents=[doc["text"]],
                ids=[doc["id"]],
                metadatas=[{
                    "filename": doc["filename"],
                    "source": doc["source"],
                    "url": doc["meta"].get("url", "N/A"),
                    "category": doc["meta"].get("category", "Uncategorized"),
                    "engagementScore": doc["meta"].get("engagementScore", "0")
                }],
                embeddings=[embedding]
            )
            print(f"✅ Added: {doc['filename']}")
            count += 1
        except Exception as e:
            print(f"❌ Failed to add {doc['filename']}: {e}")

    print(f"\n🎉 Done. Added {count} new documents to ChromaDB.")


if __name__ == "__main__":
    ingest()