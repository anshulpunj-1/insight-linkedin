import chromadb


client = chromadb.PersistentClient(path="./chroma_db")  # or use absolute path
collection = client.get_or_create_collection("linkedin_posts")

print(f"📦 Total documents: {collection.count()}")

results = collection.get(include=["metadatas", "documents"])
for i in range(min(3, len(results['ids']))):
    print(f"\n🧠 Document {i+1}")
    print("🔗 URL:", results["metadatas"][i].get("url"))
    print("📎 Keyword:", results["metadatas"][i].get("keyword"))
    print("📝 Snippet:", results["documents"][i][:300], "...")