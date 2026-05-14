from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel
import os
import asyncio
import sys
import hashlib
import re
import threading
from urllib.parse import urlparse, urljoin, urlunparse
from dotenv import load_dotenv
import numpy as np

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

MODELS_TO_TRY = [
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
]

EMBED_MODEL = "gemini-embedding-001"

# ─────────────────────────────────────────────
# IN-MEMORY RAG STORE
# ─────────────────────────────────────────────

rag_store: dict[str, dict] = {}


def get_session_id(url: str) -> str:
    """Stable session ID based on the base domain."""
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    return hashlib.md5(base.encode()).hexdigest()


def normalize_url(url: str) -> str:
    """Remove fragment and normalize trailing slash for deduplication."""
    parsed = urlparse(url)
    normalized = urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path.rstrip("/") or "/",
        parsed.params,
        parsed.query,
        "",  # no fragment
    ))
    return normalized


# ─────────────────────────────────────────────
# PLAYWRIGHT — runs in an isolated thread with its own event loop
#
# Why: On Windows + Python 3.14, FastAPI/uvicorn uses SelectorEventLoop,
# but Playwright needs ProactorEventLoop to spawn subprocesses.
# Setting a global policy breaks one or the other.
# Solution: run ALL Playwright code in a dedicated thread that calls
# asyncio.run(), which creates a fresh ProactorEventLoop (default on Windows
# in Python 3.8+) that is completely isolated from FastAPI's loop.
# ─────────────────────────────────────────────

def _run_playwright_in_thread(start_url: str, max_pages: int) -> list[dict]:
    """
    Entry point called from a background thread.
    Creates its own event loop (ProactorEventLoop on Windows) and runs
    the async scraper inside it, fully isolated from FastAPI's loop.
    """
    # On Windows, explicitly use ProactorEventLoop inside this thread.
    if sys.platform == "win32":
        loop = asyncio.ProactorEventLoop()
        asyncio.set_event_loop(loop)
    else:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    try:
        return loop.run_until_complete(_async_recursive_scrape(start_url, max_pages))
    finally:
        loop.close()


async def _async_scrape_page(page, url: str) -> dict:
    """Scrape a single page and return text + links."""
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)

        try:
            await page.wait_for_selector("body", timeout=8000)
        except Exception:
            pass

        title = await page.title()

        text_content = await page.evaluate("""
            () => {
                const remove = document.querySelectorAll(
                    'script, style, nav, footer, header, iframe, noscript, [aria-hidden="true"]'
                );
                remove.forEach(el => el.remove());
                const body = document.body;
                return body ? body.innerText : '';
            }
        """)

        links = await page.evaluate("""
            () => {
                return Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter(href => href && (href.startsWith('http://') || href.startsWith('https://')))
                    .slice(0, 50);
            }
        """)

        return {
            "url": url,
            "title": title,
            "text": text_content.strip() if text_content else "",
            "links": links,
            "success": True,
        }
    except Exception as e:
        print(f"[SCRAPER] Failed {url}: {e}")
        return {"url": url, "title": "", "text": "", "links": [], "success": False, "error": str(e)}


async def _async_recursive_scrape(start_url: str, max_pages: int = 6) -> list[dict]:
    """
    The actual async scrape logic — runs inside the dedicated thread's loop,
    so it's safe to import and use Playwright here without touching FastAPI's loop.
    """
    # Import Playwright here so it is only loaded in the worker thread context.
    from playwright.async_api import async_playwright

    parsed = urlparse(start_url)
    base_domain = f"{parsed.scheme}://{parsed.netloc}"

    visited: set[str] = set()
    to_visit: list[str] = [normalize_url(start_url)]
    results: list[dict] = []

    try:
        async with async_playwright() as p:
            # NOTE: --single-process is NOT used here.
            # On Windows it is explicitly unsupported by Chromium and causes
            # the renderer to crash immediately, producing the error:
            # "Page.evaluate: Target page, context or browser has been closed"
            # The flags below are safe on both Windows and Linux.
            is_windows = sys.platform == "win32"
            launch_args = [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-extensions",
                "--disable-background-networking",
                "--disable-sync",
                "--metrics-recording-only",
                "--mute-audio",
                "--no-first-run",
            ]
            if not is_windows:
                # GPU disable helps in Linux headless environments; on Windows
                # it can combine badly with other flags and cause instability.
                launch_args.append("--disable-gpu")

            browser = await p.chromium.launch(
                headless=True,
                args=launch_args,
            )
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                java_script_enabled=True,
            )
            page = await context.new_page()

            async def block_assets(route):
                if re.search(
                    r'\.(png|jpg|jpeg|gif|svg|css|woff2?|ttf|ico|mp4|mp3|pdf|webp)(\?.*)?$',
                    route.request.url, re.IGNORECASE
                ):
                    await route.abort()
                else:
                    await route.continue_()

            await page.route("**/*", block_assets)

            while to_visit and len(visited) < max_pages:
                url = to_visit.pop(0)
                if url in visited:
                    continue

                visited.add(url)
                print(f"[SCRAPER] Scraping ({len(visited)}/{max_pages}): {url}")
                result = await _async_scrape_page(page, url)

                if result["success"] and result["text"] and len(result["text"]) > 100:
                    results.append(result)
                    print(f"[SCRAPER] Got {len(result['text'])} chars from: {url}")

                    for link in result.get("links", []):
                        try:
                            link_parsed = urlparse(link)
                            link_domain = f"{link_parsed.scheme}://{link_parsed.netloc}"
                            norm_link = normalize_url(link)
                            if (
                                link_domain == base_domain
                                and norm_link not in visited
                                and norm_link not in to_visit
                            ):
                                to_visit.append(norm_link)
                        except Exception:
                            continue
                else:
                    if not result["success"]:
                        print(f"[SCRAPER] Skipped (error): {url}")
                    else:
                        print(f"[SCRAPER] Skipped (no content): {url}")

            await browser.close()

    except Exception as e:
        print(f"[SCRAPER ERROR] {e}")

    print(f"[SCRAPER] Done. Scraped {len(results)} pages successfully.")
    return results


async def recursive_scrape(start_url: str, max_pages: int = 6) -> list[dict]:
    """
    FastAPI-facing wrapper: offloads Playwright to a background thread
    so it runs in its own ProactorEventLoop, away from FastAPI's loop.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,  # default ThreadPoolExecutor
        _run_playwright_in_thread,
        start_url,
        max_pages,
    )


# ─────────────────────────────────────────────
# TEXT CHUNKING
# ─────────────────────────────────────────────

def chunk_text(text: str, url: str, title: str, chunk_size: int = 400, overlap: int = 50) -> list[dict]:
    """Split text into overlapping chunks for RAG."""
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = text.strip()

    if not text:
        return []

    words = text.split()
    chunks = []
    step = chunk_size - overlap

    for i in range(0, len(words), step):
        chunk_words = words[i:i + chunk_size]
        if len(chunk_words) < 20:
            continue
        chunk_str = " ".join(chunk_words)
        chunks.append({
            "text": chunk_str,
            "url": url,
            "title": title,
            "chunk_index": len(chunks),
        })

    return chunks


# ─────────────────────────────────────────────
# EMBEDDINGS + VECTOR SEARCH
# ─────────────────────────────────────────────

async def embed_text(text: str) -> list[float]:
    """Get embedding for a single text using Google's embedding model."""
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: client.models.embed_content(
                model=EMBED_MODEL,
                contents=text,
            )
        )
        embeddings = result.embeddings
        if embeddings and len(embeddings) > 0:
            return list(embeddings[0].values)
        return []
    except Exception as e:
        print(f"[EMBED ERROR] {e}")
        return []


async def embed_chunks(chunks: list[dict]) -> list[list[float]]:
    """
    Embed all chunks one at a time (most reliable across API versions).
    """
    loop = asyncio.get_running_loop()
    embeddings = []
    total = len(chunks)

    for i, chunk in enumerate(chunks):
        if i % 10 == 0:
            print(f"[EMBED] {i}/{total} chunks embedded...")
        try:
            result = await loop.run_in_executor(
                None,
                lambda t=chunk["text"]: client.models.embed_content(
                    model=EMBED_MODEL,
                    contents=t,
                )
            )
            emb_list = result.embeddings
            if emb_list and len(emb_list) > 0:
                embeddings.append(list(emb_list[0].values))
            else:
                embeddings.append([])
        except Exception as e:
            print(f"[EMBED CHUNK ERROR] chunk {i}: {e}")
            embeddings.append([])

    print(f"[EMBED] Done. {sum(1 for e in embeddings if e)} valid embeddings out of {total}.")
    return embeddings


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    if not a or not b:
        return 0.0
    va, vb = np.array(a, dtype=np.float32), np.array(b, dtype=np.float32)
    norm_a, norm_b = np.linalg.norm(va), np.linalg.norm(vb)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


def retrieve_top_chunks(query_embedding: list[float], session_id: str, top_k: int = 5) -> list[dict]:
    """Find the most relevant chunks for a query using cosine similarity."""
    if session_id not in rag_store:
        return []

    store = rag_store[session_id]
    chunks = store["chunks"]
    embeddings = store["embeddings"]

    if not chunks or not embeddings:
        return []

    scores = [cosine_similarity(query_embedding, emb) for emb in embeddings]
    top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]

    return [
        {**chunks[i], "score": round(scores[i], 4)}
        for i in top_indices
        if scores[i] > 0.2
    ]


# ─────────────────────────────────────────────
# GEMINI ANSWER GENERATION — untouched
# ─────────────────────────────────────────────

async def call_gemini(question: str, context_chunks: list[dict], site_title: str = "") -> str:
    """Generate an answer from retrieved chunks."""
    if not context_chunks:
        context_text = "No relevant content found for this question."
    else:
        context_parts = []
        seen_urls: set[str] = set()
        for chunk in context_chunks:
            url = chunk["url"]
            if url not in seen_urls:
                seen_urls.add(url)
                context_parts.append(f"\n[Source: {chunk['title']} — {url}]")
            context_parts.append(chunk["text"])
        context_text = "\n\n".join(context_parts)[:2000]

    full_prompt = f"""You are a helpful AI assistant for the website: {site_title}.

Using ONLY the content below, answer the user's question accurately and concisely.
If the answer isn't in the content, say so honestly.
Always cite which page/section you got the info from when relevant.

--- RETRIEVED CONTENT ---
{context_text}
--- END CONTENT ---

User question: {question}

Answer:"""

    loop = asyncio.get_running_loop()
    last_error = None

    for model_name in MODELS_TO_TRY:
        try:
            print(f"[GEMINI] Trying model: {model_name}")
            response = await loop.run_in_executor(
                None,
                lambda m=model_name: client.models.generate_content(
                    model=m,
                    contents=full_prompt,
                    config=types.GenerateContentConfig(
                        max_output_tokens=1024,
                        temperature=0.2,
                    ),
                )
            )
            print(f"[GEMINI] Success with model: {model_name}")
            return response.text
        except Exception as e:
            print(f"[GEMINI] Model {model_name} failed: {e}")
            last_error = e
            continue

    return f"All models failed. Last error: {last_error}"


# ─────────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────────

class ChatRequest(BaseModel):
    url: str = ""
    message: str = ""


class IngestRequest(BaseModel):
    url: str


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "running", "models": MODELS_TO_TRY}


@app.post("/ingest")
async def ingest(request: IngestRequest):
    """
    Step 1: Scrape and index a URL into the RAG store.
    POST body: { "url": "https://example.com" }
    """
    url = request.url.strip()
    if not url:
        return {"error": "No URL provided"}

    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return {"error": "Invalid URL — must include https://"}

    session_id = get_session_id(url)

    if session_id in rag_store and rag_store[session_id].get("chunks"):
        store = rag_store[session_id]
        return {
            "status": "already_indexed",
            "session_id": session_id,
            "pages_scraped": store["pages_scraped"],
            "chunks_indexed": len(store["chunks"]),
            "site_title": store["site_title"],
        }

    pages = await recursive_scrape(url, max_pages=6)

    if not pages:
        return {
            "error": (
                "Could not scrape any content from the provided URL. "
                "The site may block bots, require JavaScript heavily, or be unreachable."
            )
        }

    all_chunks = []
    for page_data in pages:
        chunks = chunk_text(page_data["text"], page_data["url"], page_data["title"])
        all_chunks.extend(chunks)
        print(f"[INGEST] {len(chunks)} chunks from: {page_data['url']}")

    if not all_chunks:
        return {"error": "No usable text content found on the site."}

    print(f"[INGEST] Embedding {len(all_chunks)} chunks...")
    embeddings = await embed_chunks(all_chunks)

    rag_store[session_id] = {
        "chunks": all_chunks,
        "embeddings": embeddings,
        "pages_scraped": len(pages),
        "site_title": pages[0]["title"] if pages else url,
        "base_url": url,
    }

    print(f"[INGEST] Done. {len(all_chunks)} chunks from {len(pages)} pages indexed.")

    return {
        "status": "indexed",
        "session_id": session_id,
        "pages_scraped": len(pages),
        "chunks_indexed": len(all_chunks),
        "site_title": pages[0]["title"] if pages else url,
    }


@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Step 2: Answer a question using RAG over the indexed content.
    POST body: { "url": "https://example.com", "message": "what is this?" }
    """
    url = request.url.strip()
    message = request.message.strip()

    if not message:
        return {"reply": "Please ask a question."}

    if not url:
        return {"reply": "Please provide a URL first so I can look it up for you."}

    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return {"reply": "Invalid URL — please include https://"}

    session_id = get_session_id(url)

    if session_id not in rag_store or not rag_store[session_id].get("chunks"):
        print(f"[CHAT] Auto-ingesting {url}...")
        ingest_result = await ingest(IngestRequest(url=url))
        if "error" in ingest_result:
            return {"reply": f"Could not load the site: {ingest_result['error']}"}

    store = rag_store[session_id]
    site_title = store.get("site_title", url)

    query_embedding = await embed_text(message)
    if not query_embedding:
        return {"reply": "Could not process your question (embedding failed). Please try again."}

    top_chunks = retrieve_top_chunks(query_embedding, session_id, top_k=5)
    print(f"[CHAT] Retrieved {len(top_chunks)} relevant chunks for: '{message}'")

    answer = await call_gemini(message, top_chunks, site_title)

    seen: set[str] = set()
    sources = []
    for c in top_chunks:
        if c["url"] not in seen:
            seen.add(c["url"])
            sources.append(c["url"])

    return {
        "reply": answer,
        "sources": sources,
        "site_title": site_title,
        "chunks_used": len(top_chunks),
    }


@app.get("/status/{session_id}")
async def status(session_id: str):
    """Check if a URL has been indexed."""
    if session_id in rag_store:
        store = rag_store[session_id]
        return {
            "indexed": True,
            "pages_scraped": store["pages_scraped"],
            "chunks_indexed": len(store["chunks"]),
            "site_title": store["site_title"],
        }
    return {"indexed": False}


@app.delete("/clear/{session_id}")
async def clear_session(session_id: str):
    """Clear a session's indexed data."""
    if session_id in rag_store:
        del rag_store[session_id]
        return {"status": "cleared"}
    return {"status": "not_found"}