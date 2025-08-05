import requests
import os

# This assumes you're running Ollama locally with Mistral loaded.
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")

def chat_with_mistral(prompt: str, system: str = None) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False
    }
    if system:
        payload["system"] = system

    try:
        response = requests.post(f"{OLLAMA_URL}/api/generate", json=payload)
        response.raise_for_status()
        result = response.json()
        return result.get("response", "")

    except requests.RequestException as e:
        print(f"❌ Ollama request failed: {e}")
        return ""

# Example Usage (for testing interactively)
if __name__ == "__main__":
    reply = chat_with_mistral("Summarize the hiring trends in AI startups this week.")
    print("\n💬 Mistral Response:\n", reply)