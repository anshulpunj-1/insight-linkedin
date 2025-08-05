export function classifyPost(content = '', returnMultiple = false) {
  const CATEGORY_RULES = [
    {
      category: "Funding",
      patterns: [
        /\b(raised|secured|closed|investment|funded|series [abc])\b/i,
        /\$[0-9]+[mkb]/i,
        /\bvc\b/i,
        /seed round/i,
        /\bpitch\b/
      ]
    },
    {
      category: "AI Recruitment",
      patterns: [
        /ai[-\s]?powered sourcing/i,
        /\bai recruitment\b/i,
        /\bai hiring\b/i,
        /tech hiring/i,
        /recruitment tools/i,
        /talent acquisition/i,
        /hireez/i,
        /seekout/i,
        /entelo/i,
        /recruiters?\b/i,
        /scaling (tech )?hirings?/i,
        /international (hiring|recruitment)/i,
        /diversity (hiring|recruitment)/i
      ]
    },
    {
      category: "Hiring",
      patterns: [
        /\bwe('?| are)? hiring\b/i,
        /\bjoin our team\b/i,
        /apply now/i,
        /job (opening|posting)/i,
        /\bopen position\b/i,
        /\bhiring (genai|llm|ai)/i
      ]
    },
    {
      category: "LLM Agent / GenAI",
      patterns: [
        /autonomous (agents|systems)/i,
        /\bagentic ai\b/i,
        /\bai agents\b/i,
        /langchain/i,
        /llms?/i,
        /rag (pipeline|system)?/i,
        /\bgenerative ai\b/i,
        /\bgenai\b/i,
        /openai|anthropic|claude|mistral|gpt-4/i
      ]
    },
    {
      category: "Research Paper",
      patterns: [
        /arxiv\.org/i,
        /we (propose|present|introduce)/i,
        /our (method|approach|technique)/i,
        /preprint|publication|paper/i
      ]
    },
    {
      category: "Product Launch / Update",
      patterns: [
        /\blaunch(ed|ing)?\b/i,
        /\bintroducing\b/i,
        /our (latest|new) (feature|product|tool)/i,
        /\bproduct update\b/i,
        /\bnew release\b/i
      ]
    },
    {
      category: "Open Source",
      patterns: [
        /\bopen source\b/i,
        /\bgithub.com\/[^\s]+/i,
        /\bnpm (install|package)\b/i,
        /\bpypi\b/,
        /repo link/i
      ]
    },
    {
      category: "Event / Webinar",
      patterns: [
        /webinar/i,
        /register now/i,
        /\bconference\b/i,
        /join us (live|at)/i,
        /talk at/i
      ]
    },
    {
      category: "Startup Pitch / Accelerator",
      patterns: [
        /demo day/i,
        /startup school/i,
        /accelerator/i,
        /pitching/i,
        /cohort/i
      ]
    },
    {
      category: "Personal Opinion",
      patterns: [
        /\bi (believe|think|feel)\b/i,
        /in my opinion/i,
        /my thoughts on\b/i,
        /\bfelt like\b/i
      ]
    },
    {
      category: "News / Partnership",
      patterns: [
        /\bannounces\b/i,
        /\bpartnership\b/i,
        /breaking news/i,
        /collaboration with/i,
        /\bnews\b/i
      ]
    }
  ];

  const lower = content.toLowerCase().trim();
  const matched = [];

  for (const rule of CATEGORY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(lower)) {
        if (returnMultiple) {
          matched.push(rule.category);
          break;
        } else {
          return rule.category;
        }
      }
    }
  }

  return returnMultiple
    ? matched.length ? matched : ["General AI Insight"]
    : "General AI Insight";
}