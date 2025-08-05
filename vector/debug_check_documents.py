# debug_check_documents.py
from chromadb import PersistentClient
from config import CHROMA_PATH

client = PersistentClient(path=CHROMA_PATH)
collection = client.get_or_create_collection(name="linkedin-posts")
results = collection.get(include=["documents", "metadatas"])

empty_docs = [i for i, doc in enumerate(results["documents"]) if not doc.strip()]
print(f"❌ Empty documents: {len(empty_docs)}")

non_empty_samples = [(i, doc[:300]) for i, doc in enumerate(results["documents"]) if doc.strip()][:3]
for i, sample in non_empty_samples:
    print(f"\n📄 Sample {i}:\n{sample}\n{'-'*40}")