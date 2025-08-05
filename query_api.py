# query_api.py
# Provides a FastAPI interface to query ChromaDB with semantic + metadata ranking

from fastapi import FastAPI, Query
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import uvicorn
from typing import List, Optional
import operator

# Load embedding model
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"
model = SentenceTransformer(EMBED_MODEL_NAME)

# ChromaDB setup
client = chromadb.Client(Settings(chroma_db_impl="duckdb", persist_directory=".chromadb_store"))
collection = client.get_or_create_collection("linkedin_posts")

app = FastAPI(title="Semantic Research Assistant")

class SearchResult(BaseModel):
    summary: str
    url: Optional[str] = None
    keyword: Optional[str] = None
    engagementScore: Optional[float] = None
    rankScore: Optional[float] = None
    timestamp: Optional[str] = None

@app.get("/search", response_model=List[SearchResult])
def search(
    q: str = Query(..., description="Your query/question"),
    top_k: int = 5,
    keyword_filter: Optional[str] = None,
    min_rank: float = 0.0
):
    embedded_query = model.encode(q)

    results = collection.query(
        query_embeddings=[embedded_query],
        n_results=top_k * 2,  # fetch more to filter later
        where={"keyword": keyword_filter} if keyword_filter else {}
    )

    matched = []
    for i in range(len(results["ids"][0])):
        metadata = results["metadatas"][0][i]
        doc = results["documents"][0][i]
        if metadata.get("rankScore", 0) >= min_rank:
            matched.append(SearchResult(summary=doc, **metadata))

    # Sort by rankScore descending
    matched.sort(key=operator.attrgetter("rankScore"), reverse=True)
    return matched[:top_k]

if __name__ == "__main__":
    uvicorn.run("query_api:app", host="0.0.0.0", port=8000, reload=True)