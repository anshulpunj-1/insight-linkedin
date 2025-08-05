import hashlib
import os
import re
import chromadb
from embed_mistral import get_embedding

client = chromadb.PersistentClient(path="chroma_store")
collection = client.get_or_create_collection("linkedin_posts")

def parse_metadata_and_text(txt_path):
    with open(txt_path, 'r') as f:
        content = f.read()

    metadata_block = re.search(r"--- METADATA ---\n(.*?)\n----------------", content, re.DOTALL)
    if not metadata_block:
        return None

    metadata_lines = metadata_block.group(1).splitlines()
    metadata = {line.split(":")[0].strip(): line.split(":", 1)[1].strip() for line in metadata_lines if ":" in line}
    main_text = content.split('--- METADATA ---')[1].split('----------------')[1].strip()
    
    return metadata, main_text

def compute_id(content):
    return hashlib.md5(content.encode("utf-8")).hexdigest()

def embed_and_upload(txt_path):
    metadata, main_text = parse_metadata_and_text(txt_path)
    if not metadata: return False

    uid = compute_id(main_text)
    embedding = get_embedding(main_text)

    collection.upsert(
        ids=[uid],
        documents=[main_text],
        metadatas=[metadata],
        embeddings=[embedding]
    )
    return True