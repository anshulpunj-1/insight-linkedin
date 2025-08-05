# chatbot_local.py

import os
import chromadb
from sentence_transformers import SentenceTransformer
import subprocess
import textwrap
from rich.console import Console

import shutil

# === INIT ===
os.environ["TOKENIZERS_PARALLELISM"] = "false"
console = Console()

# === CONFIG ===
CHROMA_DB_DIR = "./chroma_db"
COLLECTION_NAME = "linkedin_posts"
TOP_K = 3
WRAP_WIDTH = 100

# === INIT VECTOR DB + EMBEDDING MODEL ===
model = SentenceTransformer("mixedbread-ai/mxbai-embed-large-v1")
embedding_dim = model.get_sentence_embedding_dimension()



# 💣 Delete the old DB directory to avoid dimension mismatch
if os.path.exists(CHROMA_DB_DIR):
  

 client = chromadb.PersistentClient(path=CHROMA_DB_DIR)

# 🆕 Recreate collection with correct embedding dimension (1024)
collection = client.get_or_create_collection(COLLECTION_NAME)

# Delete & recreate if dimension is wrong
def ensure_collection():
    try:
        collection = client.get_collection(COLLECTION_NAME)
        test_vec = model.encode("test sentence")
        if len(test_vec) != embedding_dim:
            console.print(f"⚠️ [red]Embedding size mismatch. Recreating collection...[/red]")
            client.delete_collection(COLLECTION_NAME)
            return client.create_collection(COLLECTION_NAME)
        return collection
    except:
        return client.create_collection(COLLECTION_NAME)

collection = ensure_collection()

# === FORMAT POST METADATA FOR DISPLAY ===
def format_doc(i, meta, doc):
    return f"""
📄 POST {i+1}
🔗 URL: {meta.get("url", "N/A")}
📎 Keyword: {meta.get("keyword", "N/A")}
📝 Snippet:
{textwrap.fill(doc[:500], width=WRAP_WIDTH)}...
""".strip()

# === BUILD RAG PROMPT FOR MISTRAL ===
def build_prompt(query, docs, urls):
    context = "\n\n".join(
        f"POST {i+1}:\n{textwrap.shorten(d, width=1000)}"
        for i, d in enumerate(docs)
    )
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
        console.print("\n🤖 [bold cyan]Mistral is thinking...[/bold cyan]\n")
        result = subprocess.run(
            ["ollama", "run", "mistral"],
            input=prompt.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60
        )
        output = result.stdout.decode("utf-8").strip()
        if not output:
            return "⚠️ Mistral returned no answer. Try rephrasing your question or restart Ollama."
        return output
    except subprocess.TimeoutExpired:
        return "⚠️ Mistral took too long to respond."
    except Exception as e:
        return f"⚠️ Error calling Mistral: {e}"

# === MAIN CHAT LOOP ===
if __name__ == "__main__":
    console.print("💬 [bold green]Ask your LinkedIn RAG chatbot anything[/bold green] (type 'exit' to quit)")
    while True:
        query = input("\n🧠 You: ").strip()
        if query.lower() in ['exit', 'quit']:
            console.print("👋 [bold red]Goodbye![/bold red]")
            break

        query_embedding = model.encode(query).tolist()
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=TOP_K,
            include=["documents", "metadatas"]
        )

        docs = results["documents"][0]
        metadatas = results["metadatas"][0]

        if not docs:
            console.print("❌ [bold red]No relevant posts found.[/bold red]")
            continue

        console.print("\n🔎 [bold blue]Top matching posts:[/bold blue]")
        for i, (meta, doc) in enumerate(zip(metadatas, docs)):
            console.print(format_doc(i, meta, doc))

        urls = [meta.get("url", "") for meta in metadatas]
        prompt = build_prompt(query, docs, urls)
        answer = ask_mistral(prompt)

        console.print("\n💡 [bold yellow]Answer:[/bold yellow]\n")
        console.print(textwrap.fill(answer, width=WRAP_WIDTH))

        console.print("\n🔗 [bold green]Referenced Posts:[/bold green]")
        for i, url in enumerate(urls):
            if url:
                console.print(f"POST {i+1}: [blue underline]{url}[/]")