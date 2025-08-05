# chatbot_core.py

import os
import chromadb
import textwrap
import subprocess
from sentence_transformers import SentenceTransformer

# === CONFIG ===
CHROMA_DB_DIR = "./chroma_db"
COLLECTION_NAME = "linkedin_posts"
TOP_K = 3
WRAP_WIDTH = 100

# === INIT ===
os.environ["TOKENIZERS_PARALLELISM"] = "false"
model = SentenceTransformer("mixedbread-ai/mxbai-embed-large-v1")
embedding_dim = model.get_sentence_embedding_dimension()

# === INIT CHROMA ===
def init_chroma():
    client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
    return client.get_or_create_collection(name=COLLECTION_NAME)

# === BUILD RAG PROMPT ===
def build_prompt(query, docs, urls):
    context = "\n\n".join(f"POST {i+1}:\n{textwrap.shorten(d, width=1000)}" for i, d in enumerate(docs))
    links = "\n".join(f"POST {i+1} → {url}" for i, url in enumerate(urls))
    return f"""You are a helpful assistant analyzing LinkedIn posts.

Context:
{context}

Question:
{query}

Instructions:
1. Answer concisely in 4–6 bullet points.
2. Summarize main insights from the posts.
3. Then show the post links in format: POST 1 → [link]

{links if links else ""}
"""

# === CALL LOCAL MISTRAL ===
def ask_mistral(prompt):
    try:
        result = subprocess.run(
            ["ollama", "run", "mistral"],
            input=prompt.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=90
        )
        return result.stdout.decode("utf-8").strip()
    except Exception as e:
        return f"⚠️ Error calling Mistral: {e}"

# === MAIN RAG FUNCTION ===
def rag_answer(query, collection):
    query_embedding = model.encode(query).tolist()
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=TOP_K,
        include=["documents", "metadatas", "embeddings"]
    )

    if not results["documents"] or not results["documents"][0]:
        return "❌ No relevant posts found.", []

    docs = results["documents"][0]
    metas = results["metadatas"][0]
    doc_embeddings = results["embeddings"][0]

    # 🔍 Cosine similarity function
    def cosine_similarity(a, b):
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

    # ✅ Compute similarity between query and each document
    similarities = [cosine_similarity(query_embedding, emb) for emb in doc_embeddings]

    # ✅ Filter documents with a reasonable semantic threshold
    threshold = 0.4
    relevant_docs = [
        (doc, meta) for doc, meta, sim in zip(docs, metas, similarities)
        if sim >= threshold
    ]

    if not relevant_docs:
        return "❌ No relevant LinkedIn posts were found for this topic.", []

    filtered_docs, filtered_metas = zip(*relevant_docs)
    urls = [meta.get("url", "") for meta in filtered_metas]
    prompt = build_prompt(query, filtered_docs, urls)
    answer = ask_mistral(prompt)
    return answer, filtered_metas