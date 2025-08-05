# summarizer.py
# Uses Mistral locally to summarize content pulled from Google Drive

import os
import json
from pathlib import Path

# Choose the local model interface you prefer: `llama-cpp`, `transformers`, or `ollama`
# Below is a `transformers`-based example for Mistral

from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
import torch

# Load model only once
MODEL_NAME = "mistralai/Mistral-7B-Instruct-v0.2"
device = "cuda" if torch.cuda.is_available() else "cpu"

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForCausalLM.from_pretrained(MODEL_NAME, torch_dtype=torch.float16 if device == "cuda" else torch.float32).to(device)
gen_pipeline = pipeline("text-generation", model=model, tokenizer=tokenizer, device=0 if device == "cuda" else -1)

def summarize(text: str, max_tokens: int = 512) -> str:
    prompt = f"""You are a helpful summarizer. Summarize the following content into 3-5 short bullet points:

{text.strip()[:3000]}

Summary:"""

    output = gen_pipeline(prompt, max_new_tokens=max_tokens, do_sample=False, temperature=0.7)[0]['generated_text']

    # Trim and clean up output
    summary_start = output.find("Summary:")
    summary = output[summary_start + len("Summary:"):].strip() if summary_start != -1 else output.strip()
    return summary

def process_directory(input_dir: str, output_dir: str, metadata_path: str):
    os.makedirs(output_dir, exist_ok=True)
    with open(metadata_path, 'r') as f:
        metadata_map = json.load(f)  # assumes dict: {filename: metadata}

    for file in Path(input_dir).glob("*.txt"):
        with open(file, 'r') as f:
            content = f.read()

        filename = file.name
        summary = summarize(content)

        metadata = metadata_map.get(filename, {})
        output = {
            "summary": summary,
            **metadata
        }

        with open(Path(output_dir) / file.with_suffix('.json').name, 'w') as out:
            json.dump(output, out, indent=2)
        print(f"✅ Summarized: {filename}")

if __name__ == "__main__":
    INPUT_TXT_DIR = "./data/raw/ai-startup-Raw"          # Adjust per keyword
    OUTPUT_SUMMARY_DIR = "./data/summaries/ai-startup"   # Output summaries per keyword
    METADATA_JSON = "./data/metadata/ai-startup.json"     # Should map filename to metadata

    process_directory(INPUT_TXT_DIR, OUTPUT_SUMMARY_DIR, METADATA_JSON)
