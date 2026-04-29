"""
Tests for the POST /infer-batch endpoint and infer_batch() function.

Skipped automatically when the model weights have not been downloaded yet.
"""

import os

import pytest
from fastapi.testclient import TestClient

STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
SICILIAN_FEN = "r1bqkb1r/1p2pppp/p1np1n2/1B2P3/3p4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 8"
ENDGAME_FEN = "8/8/4k3/8/4PK2/8/8/4R3 w - - 0 1"
RATING_GRID_LEN = 41  # 600..2600 in steps of 50

MODEL_PATH = os.path.join(
    os.environ.get("MAIA2_MODEL_DIR", "./maia2_models"), "rapid_model.pt"
)


def maia_model_available() -> bool:
    return os.path.exists(MODEL_PATH)


requires_model = pytest.mark.skipif(
    not maia_model_available(),
    reason="Maia-2 rapid weights not downloaded — run the service once to trigger download.",
)


@requires_model
def test_infer_batch_equivalence_to_single():
    """
    /infer-batch with [fen1, fen2] must return the same probabilities (within 1e-4)
    as two separate /infer calls.
    """
    from src.main import app  # noqa: PLC0415

    with TestClient(app) as client:
        fens = [STARTING_FEN, SICILIAN_FEN]

        # Single calls
        r1 = client.post("/infer", json={"fen": fens[0]})
        r2 = client.post("/infer", json={"fen": fens[1]})
        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text
        single_results = [r1.json(), r2.json()]

        # Batch call
        rb = client.post("/infer-batch", json={"fens": fens})
        assert rb.status_code == 200, rb.text
        batch_body = rb.json()

        assert batch_body["maiaVersion"] == "maia2-rapid-v1.0"
        assert batch_body["ratingGrid"] == list(range(600, 2601, 50))
        assert len(batch_body["results"]) == 2

        for i, (single, batch_result) in enumerate(zip(single_results, batch_body["results"])):
            assert batch_result["fen"] == fens[i], f"FEN alignment broken at index {i}"

            s_moves = single["moveIndex"]
            b_moves = batch_result["moveIndex"]
            assert s_moves == b_moves, f"moveIndex mismatch at index {i}"

            L = len(s_moves)
            assert len(single["probabilities"]) == RATING_GRID_LEN
            assert len(batch_result["probabilities"]) == RATING_GRID_LEN

            max_diff = 0.0
            for row_idx, (s_row, b_row) in enumerate(
                zip(single["probabilities"], batch_result["probabilities"])
            ):
                assert len(s_row) == L, f"single row {row_idx} length mismatch"
                assert len(b_row) == L, f"batch row {row_idx} length mismatch"
                for j, (sv, bv) in enumerate(zip(s_row, b_row)):
                    diff = abs(sv - bv)
                    if diff > max_diff:
                        max_diff = diff

            assert max_diff < 1e-4, (
                f"FEN {i}: max element-wise diff {max_diff:.2e} exceeds 1e-4"
            )
            print(f"[equiv] FEN {i} max_diff={max_diff:.2e} ✓")


@requires_model
def test_infer_batch_empty_list_returns_400():
    """Empty fens list must return HTTP 400."""
    from src.main import app  # noqa: PLC0415

    with TestClient(app) as client:
        r = client.post("/infer-batch", json={"fens": []})
        assert r.status_code == 400
        body = r.json()
        assert "error" in body


@requires_model
def test_infer_batch_invalid_fen_returns_400_with_index():
    """Invalid FEN returns HTTP 400 with error message pointing to the right index."""
    from src.main import app  # noqa: PLC0415

    with TestClient(app) as client:
        fens = [STARTING_FEN, "not-a-valid-fen", ENDGAME_FEN]
        r = client.post("/infer-batch", json={"fens": fens})
        assert r.status_code == 400
        body = r.json()
        assert "error" in body
        # Must mention index 1 (the bad FEN)
        assert "1" in body["error"], f"Expected index 1 in error, got: {body['error']}"


@requires_model
def test_infer_batch_large_batch_returns_aligned_results():
    """A 64-FEN batch must succeed and return 64 result rows aligned to input."""
    from src.main import app  # noqa: PLC0415

    # Build 64 FENs by cycling through a few representative positions
    base_fens = [STARTING_FEN, SICILIAN_FEN, ENDGAME_FEN]
    fens = [base_fens[i % len(base_fens)] for i in range(64)]

    with TestClient(app) as client:
        r = client.post("/infer-batch", json={"fens": fens})
        assert r.status_code == 200, r.text
        body = r.json()

        assert len(body["results"]) == 64, f"Expected 64 results, got {len(body['results'])}"
        for i, result in enumerate(body["results"]):
            assert result["fen"] == fens[i], f"FEN alignment broken at index {i}"
            assert len(result["probabilities"]) == RATING_GRID_LEN, (
                f"Result {i}: expected {RATING_GRID_LEN} rating rows"
            )
            assert len(result["moveIndex"]) > 0, f"Result {i}: empty moveIndex"


def test_infer_batch_over_limit_returns_413():
    """
    Sending >256 FENs must return HTTP 413 without loading the model.
    This test runs without model weights.
    """
    from src.main import app  # noqa: PLC0415

    # We need a running app — use lifespan=False to skip model loading
    # and check the size guard before any model access.
    # Use 257 copies of the starting FEN.
    fens = [STARTING_FEN] * 257

    # Patch _model so the endpoint guard fires before model access.
    import src.main as main_mod  # noqa: PLC0415

    original_model = main_mod._model
    original_prepared = main_mod._prepared
    try:
        # Set dummy non-None values so the endpoint doesn't short-circuit on None
        # (the size check fires before inference, so we just need it to reach that code).
        # We'll test the guard fires first by leaving model as None — the size guard
        # is checked before the model is used.
        main_mod._model = object()
        main_mod._prepared = object()

        with TestClient(app, raise_server_exceptions=False) as client:
            r = client.post("/infer-batch", json={"fens": fens})
            assert r.status_code == 413, f"Expected 413, got {r.status_code}: {r.text}"
            assert "error" in r.json()
    finally:
        main_mod._model = original_model
        main_mod._prepared = original_prepared
