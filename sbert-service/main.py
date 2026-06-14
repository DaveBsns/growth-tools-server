import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, util

app = FastAPI()
model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")


class SimilarityRequest(BaseModel):
    texts_a: list[str]
    texts_b: list[str]


class SimilarityBatchRequest(BaseModel):
    # Two equally long lists; index i in texts_a is compared against index i in texts_b
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


@app.post("/api/similarity-batch")
def compute_similarity_batch(request: SimilarityBatchRequest) -> dict:
    texts_a = [(t or "").strip() for t in request.texts_a]
    texts_b = [(t or "").strip() for t in request.texts_b]

    pair_count = min(len(texts_a), len(texts_b))
    if pair_count == 0:
        return {"scores": []}

    # Indices where both texts are non-empty; empty pairs score 0 without encoding
    valid_indices = [i for i in range(pair_count) if texts_a[i] and texts_b[i]]
    scores = [0.0] * pair_count

    if valid_indices:
        # Encode every needed text once, then compare pairwise
        to_encode = [texts_a[i] for i in valid_indices] + [texts_b[i] for i in valid_indices]
        embeddings = model.encode(to_encode, convert_to_tensor=True)
        half = len(valid_indices)
        for offset, i in enumerate(valid_indices):
            score = float(util.cos_sim(embeddings[offset], embeddings[half + offset]))
            scores[i] = round(score, 4)

    return {"scores": scores}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=False)
