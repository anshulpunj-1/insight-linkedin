import os
from notion_client import Client
from config import NOTION_API_TOKEN, NOTION_PAGE_ID, MARKDOWN_PATH
from notion_to_blocks import markdown_to_notion_blocks

def sanitize_text(text):
    return text.encode("utf-16", "surrogatepass").decode("utf-16")

def chunk_blocks(blocks, size=100):
    for i in range(0, len(blocks), size):
        yield blocks[i:i+size]

# Load & sanitize markdown
assert os.path.exists(MARKDOWN_PATH), f"{MARKDOWN_PATH} not found!"
with open(MARKDOWN_PATH, "r", encoding="utf-8") as f:
    raw_md = f.read()
clean_md = sanitize_text(raw_md)

# Convert to Notion blocks
notion_blocks = markdown_to_notion_blocks(clean_md)

# Initialize Notion client
notion = Client(auth=NOTION_API_TOKEN)

print("🚀 Pushing to Notion page...")

# Add a nice title block at the top
header_block = [{
    "object": "block",
    "type": "heading_2",
    "heading_2": {
        "rich_text": [{"type": "text", "text": {"content": "📬 Weekly AI & Startup Digest"}}]
    }
}]

# Push header first
notion.blocks.children.append(
    block_id=NOTION_PAGE_ID,
    children=header_block
)

# Push blocks in chunks of 100
for chunk in chunk_blocks(notion_blocks, size=100):
    notion.blocks.children.append(
        block_id=NOTION_PAGE_ID,
        children=chunk
    )

print(f"✅ Successfully pushed {len(notion_blocks)} blocks to Notion!")