# summarize_category.py

from embed_mistral import run_mistral_summary

def summarize_category(category, top_docs):
    combined = "\n\n".join([doc for _, doc, _ in top_docs])

    summary_prompt = f"""
You are an AI research analyst writing a concise, insight-driven newsletter for startup founders and operators.

Your job is to:
- Analyze the top LinkedIn posts in the category: "{category}"
- Distill patterns, tools, frameworks, and trends founders can act on
- Avoid generic advice — focus on concrete signals, frameworks, startup names, tools, GTM strategies, market shifts, etc.

Output format:
---
**🔍 Title:**  
A crisp and engaging title summarizing the theme.

**📌 Insight Bullets:**  
- Bullet 1 (real signal, example, or tool)  
- Bullet 2 (trend or actionable advice)  
- Bullet 3 (company/market/behavior shift if relevant)  
- Bullet 4 (optional, if needed — keep it sharp)

Avoid fluff. Be specific. Name startups, trends, metrics if possible.
Posts:
{combined}
"""

    print(f"[INFO] Summarizing category: {category}")
    response = run_mistral_summary(summary_prompt)

    if not response:
        return None, None

    # Takeaways prompt
    actions_prompt = f"""
Summarize 3 sharp, one-line takeaways for startup founders or PMs based on the top LinkedIn posts in "{category}".

Format:
- Takeaway 1
- Takeaway 2
- Takeaway 3

Avoid fluff. Use metrics/tools/startups when possible.

Posts:
{combined}
"""
    actions = run_mistral_summary(actions_prompt)

    return response.strip(), actions.strip()