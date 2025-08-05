# chroma_utils.py

from chromadb import PersistentClient
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction  # or your local embedding logic
from config import CHROMA_PATH, CHROMA_COLLECTION_NAME

def get_chroma_client():
    return PersistentClient(path=CHROMA_PATH)

def get_collection(client):
    return client.get_or_create_collection(name=CHROMA_COLLECTION_NAME)