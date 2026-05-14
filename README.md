🚀 Ask Any Website AI  
**AI-powered website explorer using RAG (Retrieval-Augmented Generation)**

---

## 📌 Project Description

Ask Any Website AI is a full-stack application that allows users to input any website URL and ask questions about it.

The system:
- Recursively scrapes the website
- Extracts meaningful content
- Converts it into embeddings
- Uses RAG (Retrieval-Augmented Generation) to answer questions accurately

This enables users to explore websites like a chatbot — understanding content, features, pricing, and more instantly.

---

## ⚙️ Features

- 🌐 Recursive website scraping (multi-page)
- 🧠 Semantic search using embeddings
- 💬 Context-aware AI answers
- ⚡ Latency optimization using context trimming
- 🔁 Auto-ingestion of new URLs
- 📚 Source-based answers with references

---

## 🧠 Solution Approach

### 1. Scraping
- Used **Playwright** for dynamic websites
- Recursive crawler limited to same domain
- Removed unnecessary elements (scripts, styles, etc.)
- Blocked heavy assets → faster scraping

### 2. Key Engineering Challenge (Windows + Python 3.14)
- Playwright requires `ProactorEventLoop`
- FastAPI uses `SelectorEventLoop`

❌ Conflict causes crashes

✅ Solution:
- Ran Playwright in a **separate thread with its own event loop**
- Fully isolated → stable execution

---

### 3. RAG Pipeline

URL → Scraping → Chunking → Embeddings → Retrieval → AI Response

- Split content into chunks
- Generated embeddings using Gemini
- Used cosine similarity for retrieval
- Passed only top relevant chunks to model

---

### 4. Latency Optimization ⚡

```python
context_text = context_text[:2000]

Reduces token usage

Speeds up response time

Keeps system efficient



---

🖥️ Tech Stack

Backend

FastAPI

Playwright

Google Gemini API

NumPy


Frontend

Modern UI (React-based)



---

📦 Setup & Usage

1. Clone the repository

git clone https://github.com/your-username/Ask-Any-site-AI.git
cd Ask-Any-site-AI


---

2. Create virtual environment

python -m venv venv
venv\Scripts\activate   # Windows


---

3. Install dependencies (manual)

pip install fastapi uvicorn playwright python-dotenv numpy google-generativeai pydantic


---

4. Install Playwright browsers

playwright install


---

5. Setup environment variables

Create .env file:

GEMINI_API_KEY=your_api_key_here


---

6. Run backend

cd backend
uvicorn main:app --reload


---

7. Run frontend

cd frontend 
npm install
npm run dev


---

📡 API Endpoints

POST /ingest → Scrape and index website

POST /chat → Ask questions

GET /status/{session_id} → Check status

DELETE /clear/{session_id} → Clear session



---

🚧 Challenges Solved

Playwright crashing → fixed with thread-based event loop

Slow scraping → blocked heavy assets

Noisy data → cleaned DOM before extraction

Duplicate pages → URL normalization

Latency → limited context size



---

🌟 Highlights

Works on real-world JS-heavy websites

Full RAG pipeline from scratch

Optimized for performance + accuracy

Handles async + threading issues



---

📌 Note

This project was built during a hackathon, so dependencies are installed manually instead of using a requirements.txt file.
