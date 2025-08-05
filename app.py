# app.py

import streamlit as st
from chatbot_core import rag_answer, init_chroma
from rich.console import Console

# === SETUP ===
st.set_page_config(page_title="LinkedIn RAG Chatbot", layout="wide")
console = Console()

# === INIT DB + MODEL ===
collection = init_chroma()

st.title("💬 LinkedIn RAG Chatbot (Local Mistral + ChromaDB)")
st.markdown("Ask a question based on scraped LinkedIn posts from your vector DB.")

# === INPUT ===
query = st.text_input("🧠 Your question", placeholder="e.g., How is AI used in manufacturing?")

# === RUN QUERY ===
if st.button("🔍 Search") and query.strip():
    with st.spinner("Mistral is thinking..."):
        response, posts = rag_answer(query, collection)

    st.markdown("### 💡 Answer")
    st.markdown(response)

    st.markdown("### 🔗 Referenced Posts")
    for i, post in enumerate(posts):
        url = post.get("url", "#")
        keyword = post.get("keyword", "N/A")
        st.markdown(f"- **POST {i+1}** [{keyword}] → [🔗 Link]({url})")