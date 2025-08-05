from chromadb import PersistentClient
from chromadb.config import Settings

CHROMA_PATH = "chroma_db"
COLLECTION_NAME = "linkedin-posts"

client = PersistentClient(path=CHROMA_PATH)
collection = client.get_or_create_collection(name=COLLECTION_NAME)

docs = collection.get(include=["documents", "metadatas"])

print(f"✅ Stored Documents: {len(docs['ids'])}\n")

for i, (doc_id, doc, meta) in enumerate(zip(docs['ids'], docs['documents'], docs['metadatas']), 1):
    filename = meta.get("filename", "N/A")
    category = meta.get("category", "Uncategorized")
    url = meta.get("url", "N/A")
    preview = doc.strip().replace('\n', ' ')[:140] + "..." if len(doc) > 140 else doc.strip()

    print(f"{i}. {filename}")
    print(f"   📂 Category: {category}")
    print(f"   🔗 URL: {url}")
    print(f"   ✍️ Preview: {preview}")
    print("   ──")