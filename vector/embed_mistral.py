# embed_mistral.py
import requests
import hashlib
import numpy as np

MISTRAL_URL = "http://localhost:11434/v1/chat/completions"
MISTRAL_MODEL = "mistral:instruct"

# ✅ Embedding using fixed-seed hash (or replace with real embedding logic)
def get_embedding(text):
    np.random.seed(int(hashlib.sha256(text.encode()).hexdigest(), 16) % (2**32))
    return np.random.rand(384).tolist()

# ✅ Summarization using local Mistral/Ollama endpoint
def run_mistral_summary(prompt):
    try:
        response = requests.post(
            MISTRAL_URL,
            json={
                "model": MISTRAL_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False
            },
            timeout=60
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"❌ Mistral summarization failed: {e}")
        return ""