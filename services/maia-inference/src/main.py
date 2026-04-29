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

from .maia_loader import infer, infer_batch, load_model, _prepare_inference_helpers

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


class InferBatchRequest(BaseModel):
    fens: list[str]


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


@app.post("/infer-batch")
def infer_batch_endpoint(req: InferBatchRequest):
    # --- Validate batch size ---
    if len(req.fens) == 0:
        return JSONResponse(status_code=400, content={"error": "fens list must not be empty"})
    if len(req.fens) > 256:
        return JSONResponse(
            status_code=413,
            content={"error": f"Too many FENs: {len(req.fens)} > 256"},
        )

    # --- Validate each FEN ---
    for i, fen in enumerate(req.fens):
        try:
            board = chess.Board(fen)
        except ValueError as exc:
            return JSONResponse(
                status_code=400,
                content={"error": f"invalid FEN at index {i}: {exc}"},
            )
        if not list(board.legal_moves):
            return JSONResponse(
                status_code=400,
                content={"error": f"invalid FEN at index {i}: no legal moves"},
            )

    try:
        result = infer_batch(_model, _prepared, req.fens)
    except Exception as exc:
        logger.exception("Batch inference error")
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return result
