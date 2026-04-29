"""
Maia-2 inference HTTP service.

Endpoints:
  GET  /health  — readiness probe
  POST /infer   — rating-conditioned move probability distribution

Start with:
  uv run uvicorn src.main:app --port 8765
"""

import contextlib
import logging

import chess
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .maia_loader import infer, load_model, _prepare_inference_helpers

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Shared model state (loaded once at startup) ---
_model = None
_prepared = None


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    global _model, _prepared
    logger.info("Loading Maia-2 rapid model...")
    _model = load_model()
    _prepared = _prepare_inference_helpers()
    logger.info("Model ready.")
    yield
    _model = None
    _prepared = None


app = FastAPI(title="Maia-2 Inference Service", lifespan=lifespan)


class InferRequest(BaseModel):
    fen: str


@app.get("/health")
def health():
    ready = _model is not None
    return {"status": "ok" if ready else "loading", "ready": ready}


@app.post("/infer")
def infer_endpoint(req: InferRequest):
    # --- Validate FEN ---
    try:
        board = chess.Board(req.fen)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": f"Invalid FEN: {exc}"})

    if not list(board.legal_moves):
        return JSONResponse(
            status_code=400,
            content={"error": "No legal moves in this position."},
        )

    try:
        result = infer(_model, _prepared, req.fen)
    except Exception as exc:
        logger.exception("Inference error")
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return result
