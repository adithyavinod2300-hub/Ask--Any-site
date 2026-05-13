🚀 Ask Any Site AI
🔍 Intelligent Web Chatbot using RAG + Recursive Scraping
🧠 Overview
Ask Any Site AI is an intelligent chatbot that can:

🌐 Ingest any website URL

🔁 Recursively crawl and extract content from linked pages

🧩 Convert raw content into structured knowledge

🤖 Answer user questions using Retrieval-Augmented Generation (RAG)

The system ensures high accuracy, low latency, and zero hallucination bias by grounding responses strictly in scraped content.

🎯 Problem Statement
Traditional chatbots:

❌ Lack real-time website understanding

❌ Hallucinate answers

❌ Cannot handle dynamic or multi-page websites

✅ Solution
We built a system that:

Scrapes multiple pages from a website (not just homepage)

Cleans and structures unstructured web data

Stores knowledge using embeddings

Retrieves only relevant context for each query

Generates accurate answers using LLMs

⚙️ Architecture
User → FastAPI → Scraper (Playwright)
                   ↓
               Clean Text
                   ↓
               Chunking
                   ↓
             Embeddings
                   ↓
             Vector Search
                   ↓
             Gemini LLM
                   ↓
                Response
🔥 Key Features
🌐 Recursive Web Scraping
Scrapes multiple internal pages (not just landing page)

Handles modern JS-heavy sites using Playwright

Filters irrelevant assets (images, CSS, etc.)

Avoids duplicate URLs via normalization

🧠 RAG (Retrieval-Augmented Generation)
Splits content into meaningful chunks

Converts chunks into embeddings

Uses cosine similarity for retrieval

Sends only relevant context to LLM

⚡ Latency Optimization
Context size limited to ~2000 characters

Reduces token usage + speeds up responses

context_text = "\n\n".join(context_parts)[:2000]

📌 Why this matters:

Faster responses ⚡

Lower cost 💰

No quality loss 🎯

🧵 Smart Async + Threading (Advanced Engineering)
Problem:

Playwright requires ProactorEventLoop (Windows)

FastAPI uses SelectorEventLoop

💡 Solution:

Run scraper in a separate thread with isolated event loop

loop.run_in_executor(...)
👉 Prevents crashes and ensures stability across environments

📊 Source-Aware Responses
Every answer is grounded in scraped content

Returns source URLs for transparency

🔁 Auto-Ingestion
If user asks a question without indexing:
→ system automatically scrapes + indexes the site

🧠 In-Memory Vector Store
Lightweight and fast

Session-based indexing using domain hash

No external DB needed (hackathon optimized)

🧪 Example Workflow
User inputs:

https://example.com
System:

Scrapes 5–6 pages

Extracts content

Builds embeddings

User asks:

"What pricing plans are available?"
System:

Retrieves relevant chunks

Sends to LLM

Returns accurate answer with sources

🚧 Challenges & Solutions
❗ Problem: Dynamic websites (JS-heavy)
✔ Solution:

Used Playwright instead of requests/BeautifulSoup

❗ Problem: Event loop conflicts (Windows + Python 3.14)
✔ Solution:

Isolated Playwright in separate thread with its own loop

❗ Problem: Irrelevant noisy content
✔ Solution:

Removed:

scripts

styles

nav/footer

hidden elements

❗ Problem: High latency with large context
✔ Solution:

Limited context before LLM call (2000 chars)

❗ Problem: Duplicate pages
✔ Solution:

URL normalization + visited tracking

🛠️ Tech Stack
Backend: FastAPI

Scraping: Playwright

LLM: Gemini API

Embeddings: Gemini Embedding Model

Vector Search: NumPy (cosine similarity)

Async Handling: asyncio + threading

📦 API Endpoints
🔹 /ingest
Scrape and index a website

POST /ingest
{
  "url": "https://example.com"
}
🔹 /chat
Ask questions about the site

POST /chat
{
  "url": "https://example.com",
  "message": "What does this site offer?"
}
🔹 /status/{session_id}
Check indexing status

🔹 /clear/{session_id}
Clear stored data

🚀 What Makes This Project Stand Out
🔁 Recursive multi-page scraping (not basic scraping)

🧠 Full RAG pipeline implemented from scratch

⚡ Latency-aware architecture

🧵 Advanced async + threading solution

🎯 Zero hallucination design (strict context grounding)

🪶 Lightweight (no external vector DB)

📌 Future Improvements
Streaming responses (real-time typing effect)

Multi-website querying

Persistent vector database

UI with source highlighting

🏁 Conclusion
This project demonstrates how modern AI systems can:

Understand real-world websites

Extract meaningful knowledge

Provide accurate, explainable answers

👉 Built with a focus on performance, reliability, and real-world usability

