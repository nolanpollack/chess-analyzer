"""
Integration test for the Maia-2 inference service.

Skipped automatically when the model weights have not been downloaded yet.
The model is downloaded to ./maia2_models/ on first run of the service
(or by calling maia2.model.from_pretrained directly).
"""

import os

import pytest
from fastapi.testclient import TestClient

STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
MODEL_PATH = os.path.join(
    os.environ.get("MAIA2_MODEL_DIR", "./maia2_models"), "rapid_model.pt"
)
RATING_GRID_LEN = 41  # 600..2600 in steps of 50


def maia_model_available() -> bool:
    return os.path.exists(MODEL_PATH)


@pytest.mark.skipif(
    not maia_model_available(),
    reason="Maia-2 rapid weights not downloaded — run the service once to trigger download.",
)
def test_health_and_infer_starting_position():
    # Import here so the module-level lifespan wiring doesn't break
    # tests that skip (model not yet available).
    from src.main import app  # noqa: PLC0415

    with TestClient(app) as client:
        # --- /health ---
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["ready"] is True

        # --- /infer with the standard starting position ---
        r = client.post("/infer", json={"fen": STARTING_FEN})
        assert r.status_code == 200, r.text
        body = r.json()

        # Shape checks
        assert body["maiaVersion"] == "maia2-rapid-v1.0"
        assert body["ratingGrid"] == list(range(600, 2601, 50))
        assert len(body["ratingGrid"]) == RATING_GRID_LEN

        move_index = body["moveIndex"]
        probabilities = body["probabilities"]

        assert len(probabilities) == RATING_GRID_LEN, "Expected 41 rating rows"
        L = len(move_index)
        assert L > 0, "moveIndex must not be empty"

        for i, row in enumerate(probabilities):
            assert len(row) == L, f"Row {i} length mismatch"
            row_sum = sum(row)
            assert abs(row_sum - 1.0) < 1e-3, (
                f"Row {i} (rating {body['ratingGrid'][i]}) sums to {row_sum}, expected ~1.0"
            )

        # Sanity-print first 3 moves and rating-1500 top-3 for manual review
        rating_1500_idx = body["ratingGrid"].index(1500)
        row_1500 = probabilities[rating_1500_idx]
        top3_indices = sorted(range(L), key=lambda j: row_1500[j], reverse=True)[:3]

        print("\n=== Sanity check ===")
        print(f"First 3 moveIndex entries : {move_index[:3]}")
        print("Rating-1500 top-3 (move, prob):")
        for idx in top3_indices:
            print(f"  {move_index[idx]}: {row_1500[idx]:.4f}")


@pytest.mark.skipif(
    not maia_model_available(),
    reason="Maia-2 rapid weights not downloaded.",
)
def test_invalid_fen_returns_400():
    from src.main import app  # noqa: PLC0415

    with TestClient(app) as client:
        r = client.post("/infer", json={"fen": "not-a-fen"})
        assert r.status_code == 400
        assert "error" in r.json()
