"""
Maia-2 model loading and inference.

The maia2 package exposes:
  - maia2.model.from_pretrained(type, device, save_root) → MAIA2Model
      Downloads the checkpoint from Google Drive on first call (via gdown),
      then loads it from save_root on subsequent calls.
      https://github.com/CSSLab/maia2/blob/main/maia2/model.py

  - maia2.inference.prepare() → [all_moves_dict, elo_dict, all_moves_dict_reversed]
      Builds the move-index dictionaries and the ELO bucket map once.

  - maia2.inference.inference_each(model, prepared, fen, elo_self, elo_oppo) → (move_probs_dict, win_prob)
      Single-position inference for given elo_self / elo_oppo.
      Returns a dict {uci_move: probability} (legal moves only, softmaxed).

Internally maia2 maps any ELO to one of 11 coarse buckets:
  <1100, 1100-1199, ..., 1900-1999, >=2000
so many adjacent rows in our rating grid are identical.  We deduplicate
by unique bucket index before running the forward pass, then broadcast.
"""

import os
import warnings

import torch

warnings.filterwarnings("ignore")

# Where model weights are cached between runs.
MODEL_SAVE_ROOT = os.environ.get("MAIA2_MODEL_DIR", "./maia2_models")

# The rating grid exposed via the API (600..2600 in steps of 50, 41 buckets).
RATING_GRID = list(range(600, 2601, 50))

# Maia-2 uses an opponent ELO input as well.  When rating the player we fix
# the opponent at the same ELO so the model stays self-consistent.
_SAME_ELO_AS_SELF = True


def load_model() -> object:
    """Download (if needed) and load the rapid Maia-2 model onto CPU."""
    from maia2.model import from_pretrained  # type: ignore[import]

    model = from_pretrained("rapid", device="cpu", save_root=MODEL_SAVE_ROOT)
    model.eval()
    return model


def _prepare_inference_helpers():
    """Build move-index dicts and elo_dict (called once at startup)."""
    from maia2.inference import prepare  # type: ignore[import]

    return prepare()  # [all_moves_dict, elo_dict, all_moves_dict_reversed]


def _run_single_bucket(model, prepared, fen: str, elo: int) -> dict[str, float]:
    """
    Call inference_each for one (fen, elo) pair.
    Returns {uci_move: probability} for all legal moves.
    """
    from maia2.inference import inference_each  # type: ignore[import]

    oppo_elo = elo  # fix opponent ELO == self ELO
    move_probs, _ = inference_each(model, prepared, fen, elo, oppo_elo)
    return move_probs


def infer(model, prepared, fen: str) -> dict:
    """
    Run Maia-2 inference for all 41 rating buckets in RATING_GRID.

    Deduplicates by model-internal ELO bucket to avoid redundant forward passes.
    Returns a dict ready to serialise as the API response body:
      {
        "maiaVersion": str,
        "ratingGrid": [600, 650, ..., 2600],
        "moveIndex": [uci, ...],         # length L
        "probabilities": [[...], ...],   # shape (41, L), row-major
      }
    """
    from maia2.utils import map_to_category  # type: ignore[import]

    _, elo_dict, _ = prepared

    # --- Deduplicate ratings that map to the same model bucket ---
    bucket_for_rating: list[int] = [
        map_to_category(r, elo_dict) for r in RATING_GRID
    ]
    unique_buckets: dict[int, int] = {}  # bucket_idx -> first rating that hits it
    for rating, bucket in zip(RATING_GRID, bucket_for_rating):
        if bucket not in unique_buckets:
            unique_buckets[bucket] = rating

    # --- Run one forward pass per unique bucket ---
    bucket_probs: dict[int, dict[str, float]] = {}
    for bucket, representative_rating in unique_buckets.items():
        bucket_probs[bucket] = _run_single_bucket(
            model, prepared, fen, representative_rating
        )

    # --- Collect the union of all legal moves (should be identical across buckets) ---
    all_moves_set: set[str] = set()
    for probs in bucket_probs.values():
        all_moves_set.update(probs.keys())
    move_index = sorted(all_moves_set)  # deterministic ordering

    # --- Build the (41, L) probability matrix ---
    # maia2 rounds each probability to 4 decimal places, so raw rows may sum
    # to ~0.97.  Renormalize each row so the contract guarantee (sum ≈ 1.0) holds.
    probabilities: list[list[float]] = []
    for rating, bucket in zip(RATING_GRID, bucket_for_rating):
        probs = bucket_probs[bucket]
        row = [probs.get(m, 0.0) for m in move_index]
        row_sum = sum(row)
        if row_sum > 0:
            row = [p / row_sum for p in row]
        probabilities.append(row)

    return {
        "maiaVersion": "maia2-rapid-v1.0",
        "ratingGrid": RATING_GRID,
        "moveIndex": move_index,
        "probabilities": probabilities,
    }
