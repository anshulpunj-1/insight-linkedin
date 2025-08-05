function countKeywordMatches(text, keywords) {
  let count = 0;
  for (const word of keywords) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(text)) {
      count++;
    }
  }
  return count;
}

const categoryKeywords = {
  "ai": ["ai", "artificial intelligence", "machine learning", "deep learning", "llm", "openai", "gpt"],
  "funding": ["funding", "investment", "venture", "seed round", "series a", "valuation", "raise"],
  "workflow-automation": ["workflow", "automation", "n8n", "zapier", "orchestration", "automate"],
  "education": ["education", "learning", "school", "college", "student", "course", "curriculum"],
  "startups": ["startup", "founder", "early-stage", "bootstrapped", "incubator", "accelerator"],
  "research": ["research", "paper", "study", "experiment", "findings", "publication"],
  "legal": ["law", "legal", "compliance", "regulation", "privacy", "policy"],
  "healthcare": ["health", "medical", "doctor", "treatment", "patient", "diagnosis"]
};

// ✅ DO NOT return a new array — instead modify the existing items
for (const item of items) {
  const mimeType = item.binary?.data?.mimeType || item.json?.mimeType || "";
  
  if (!mimeType.includes("text/plain")) {
    item.json.skip = true; // mark it to be filtered out later
    continue;
  }

  const base64 = item.binary.data.data;
  const buffer = Buffer.from(base64, 'base64');
  const content = buffer.toString('utf-8');
  const lower = content.toLowerCase();

  const categoryScores = {};
  const matchedCategories = [];

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    const hits = countKeywordMatches(lower, keywords);
    if (hits >= 2) {
      categoryScores[category] = hits;
      matchedCategories.push(category);
    }
  }

  item.json.content = content;
  item.json.filename = item.binary.data.fileName;
  item.json.file_id = item.json.id || null;
  item.json.mime_type = item.binary.data.mimeType;
  item.json.source = "GoogleDrive";
  item.json.categories = matchedCategories.length ? matchedCategories : ["uncategorized"];
  item.json.categoryScore = categoryScores;
}

// ✅ Filter only those items that are not marked to skip
return items.filter(item => !item.json.skip);