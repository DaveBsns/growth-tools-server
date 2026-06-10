import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, util

app = FastAPI()
model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")


class SimilarityRequest(BaseModel):
    texts_a: list[str]
    texts_b: list[str]


@app.post("/api/similarity")
def compute_similarity(request: SimilarityRequest) -> dict:
    text_a = " ".join(request.texts_a).strip()
    text_b = " ".join(request.texts_b).strip()

    if not text_a or not text_b:
        return {"score": 0.0}

    embeddings = model.encode([text_a, text_b], convert_to_tensor=True)
    score = float(util.cos_sim(embeddings[0], embeddings[1]))
    return {"score": round(score, 4)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=False)
