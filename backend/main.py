from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai
import os
from dotenv import load_dotenv
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


@app.get("/")
def home():
    return {"message": "Backend is working"}


@app.post("/chat")
async def chat(data: dict):
    try:
        user_msg = data.get("message")

        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",   # ✅ updated model name
            contents=user_msg,
        )

        return {
            "response": response.text
        }

    except Exception as e:
        print("ERROR:", e)
        return {
            "response": "AI error occurred. Check backend terminal."
        }