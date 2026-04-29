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

  - maia2.inference.preprocessing(fen, elo_self, elo_oppo, elo_dict, all_moves_dict)
      → (board_input, elo_self_idx, elo_oppo_idx, legal_moves)
      Used internally to build per-sample tensors for batching.

Internally maia2 maps any ELO to one of 11 coarse buckets:
  <1100, 1100-1199, ..., 1900-1999, >=2000
so many adjacent rows in our rating grid are identical.  We deduplicate
by unique bucket index before running the forward pass, then broadcast.

The default inference path (``USE_LEGACY_INFERENCE=False``) batches all unique
ELO buckets into a single model forward pass for a ~5-8× speedup on CPU.
Pass ``legacy=True`` to ``infer()`` (or set ``USE_LEGACY_INFERENCE=True``) to
use the original serial loop — useful for benchmarking and regression testing.
"""

import os
import warnings

import torch

warnings.filterwarnings("ignore")

# Where model weights are cached between runs.
MODEL_SAVE_ROOT = os.environ.get("MAIA2_MODEL_DIR", "./maia2_models")

# The rating grid exposed via the API (600..2600 in steps of 50, 41 buckets).
RATING_GRID = list(range(600, 2601, 50))

# Set to True to revert to the original serial per-bucket loop.
USE_LEGACY_INFERENCE = os.environ.get("USE_LEGACY_INFERENCE", "").lower() in ("1", "true", "yes")


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


def _deduplicate_buckets(prepared) -> tuple[list[int], dict[int, int]]:
    """
    Return (bucket_for_rating, unique_buckets) where:
      - bucket_for_rating[i] is the model bucket index for RATING_GRID[i]
      - unique_buckets maps bucket_idx → representative rating
    """
    from maia2.utils import map_to_category  # type: ignore[import]

    _, elo_dict, _ = prepared
    bucket_for_rating: list[int] = [map_to_category(r, elo_dict) for r in RATING_GRID]
    unique_buckets: dict[int, int] = {}
    for rating, bucket in zip(RATING_GRID, bucket_for_rating):
        if bucket not in unique_buckets:
            unique_buckets[bucket] = rating
    return bucket_for_rating, unique_buckets


def _run_batched(model, prepared, fen: str, unique_buckets: dict[int, int]) -> dict[int, dict[str, float]]:
    """
    Run a single batched forward pass over all unique ELO buckets.

    Calls ``maia2.inference.preprocessing`` for each bucket to build per-sample
    tensors, stacks them along the batch dimension, calls ``model(...)`` once,
    then post-processes each output row exactly as ``inference_each`` does.

    Returns {bucket_idx: {uci_move: probability}}.
    """
    from maia2.inference import preprocessing  # type: ignore[import]
    from maia2.utils import mirror_move  # type: ignore[import]

    all_moves_dict, elo_dict, all_moves_dict_reversed = prepared
    device = next(model.parameters()).device
    black_flag = fen.split(" ")[1] == "b"

    # Build per-bucket tensors
    bucket_order = list(unique_buckets.keys())
    boards_list, elos_self_list, elos_oppo_list, legal_moves_list = [], [], [], []
    for bucket in bucket_order:
        rep_rating = unique_buckets[bucket]
        board_input, elo_self_idx, elo_oppo_idx, legal_moves = preprocessing(
            fen, rep_rating, rep_rating, elo_dict, all_moves_dict
        )
        boards_list.append(board_input.unsqueeze(0))
        elos_self_list.append(elo_self_idx)
        elos_oppo_list.append(elo_oppo_idx)
        legal_moves_list.append(legal_moves.unsqueeze(0))

    boards = torch.cat(boards_list, dim=0).to(device)
    elos_self = torch.tensor(elos_self_list).to(device)
    elos_oppo = torch.tensor(elos_oppo_list).to(device)
    legal_moves_batch = torch.cat(legal_moves_list, dim=0).to(device)

    model.eval()
    with torch.no_grad():
        logits_maia, _, _ = model(boards, elos_self, elos_oppo)
        logits_maia_legal = logits_maia * legal_moves_batch
        probs_batch = logits_maia_legal.softmax(dim=-1).cpu()

    # Post-process each row
    legal_move_indices_shared = legal_moves_batch[0].nonzero().flatten().cpu().numpy().tolist()
    legal_moves_uci = [
        mirror_move(all_moves_dict_reversed[idx]) if black_flag else all_moves_dict_reversed[idx]
        for idx in legal_move_indices_shared
    ]

    bucket_probs: dict[int, dict[str, float]] = {}
    for i, bucket in enumerate(bucket_order):
        row = probs_batch[i].tolist()
        move_probs = {
            legal_moves_uci[j]: round(row[legal_move_indices_shared[j]], 4)
            for j in range(len(legal_move_indices_shared))
        }
        move_probs = dict(sorted(move_probs.items(), key=lambda item: item[1], reverse=True))
        bucket_probs[bucket] = move_probs

    return bucket_probs


def _run_legacy(model, prepared, fen: str, unique_buckets: dict[int, int]) -> dict[int, dict[str, float]]:
    """
    Serial per-bucket inference loop (kept for benchmarking/regression).

    Note: maia2.inference.inference_each has an upstream bug where it calls
    `legal_moves.nonzero().flatten()` on a 2D (1, N) tensor after unsqueeze,
    producing interleaved (row_idx, col_idx) pairs and a spurious extra move
    (index 0 → 'a1h8').  This path replicates the logic of `inference_each`
    with a 1D nonzero call to avoid that artefact, keeping the serial loop
    semantics while producing correct output.

    Returns {bucket_idx: {uci_move: probability}}.
    """
    from maia2.inference import preprocessing  # type: ignore[import]
    from maia2.utils import mirror_move  # type: ignore[import]

    all_moves_dict, elo_dict, all_moves_dict_reversed = prepared
    device = next(model.parameters()).device
    black_flag = fen.split(" ")[1] == "b"

    bucket_probs: dict[int, dict[str, float]] = {}
    model.eval()

    for bucket, rep_rating in unique_buckets.items():
        board_input, elo_self_idx, elo_oppo_idx, legal_moves_1d = preprocessing(
            fen, rep_rating, rep_rating, elo_dict, all_moves_dict
        )

        board_t = board_input.unsqueeze(0).to(device)
        elo_self_t = torch.tensor([elo_self_idx]).to(device)
        elo_oppo_t = torch.tensor([elo_oppo_idx]).to(device)
        legal_moves_t = legal_moves_1d.unsqueeze(0).to(device)

        with torch.no_grad():
            logits_maia, _, _ = model(board_t, elo_self_t, elo_oppo_t)
            logits_maia_legal = logits_maia * legal_moves_t
            probs = logits_maia_legal.softmax(dim=-1).cpu()[0].tolist()

        # Use 1D nonzero on the original 1D tensor to get correct move indices.
        legal_move_indices = legal_moves_1d.nonzero().flatten().tolist()
        move_probs = {}
        for idx in legal_move_indices:
            uci = all_moves_dict_reversed[idx]
            if black_flag:
                uci = mirror_move(uci)
            move_probs[uci] = round(probs[idx], 4)

        move_probs = dict(sorted(move_probs.items(), key=lambda item: item[1], reverse=True))
        bucket_probs[bucket] = move_probs

    return bucket_probs


def _build_probability_matrix(
    bucket_probs: dict[int, dict[str, float]],
    bucket_for_rating: list[int],
) -> tuple[list[str], list[list[float]]]:
    """
    Given per-bucket move-prob dicts, return (move_index, probabilities).
    move_index is sorted UCI; probabilities is shape (41, L), renormalized.
    """
    all_moves_set: set[str] = set()
    for probs in bucket_probs.values():
        all_moves_set.update(probs.keys())
    move_index = sorted(all_moves_set)

    probabilities: list[list[float]] = []
    for bucket in bucket_for_rating:
        probs = bucket_probs[bucket]
        row = [probs.get(m, 0.0) for m in move_index]
        row_sum = sum(row)
        if row_sum > 0:
            row = [p / row_sum for p in row]
        probabilities.append(row)

    return move_index, probabilities


def _run_batched_multi(
    model,
    prepared,
    fens: list[str],
    unique_buckets: dict[int, int],
) -> list[dict[int, dict[str, float]]]:
    """
    Run a single batched forward pass over K FENs × N unique ELO buckets.

    Stacks all (fen, bucket) pairs into one (K*N, ...) input tensor, calls
    ``model(...)`` once, then slices the output back per-FEN per-bucket.

    Returns a list of length K; each element is {bucket_idx: {uci_move: prob}}
    for that FEN (same structure as ``_run_batched`` / ``_run_legacy``).
    """
    from maia2.inference import preprocessing  # type: ignore[import]
    from maia2.utils import mirror_move  # type: ignore[import]

    all_moves_dict, elo_dict, all_moves_dict_reversed = prepared
    device = next(model.parameters()).device
    bucket_order = list(unique_buckets.keys())
    n_buckets = len(bucket_order)

    # --- Build input tensors: one row per (fen, bucket) pair ---
    boards_list, elos_self_list, elos_oppo_list, legal_moves_list = [], [], [], []
    # Per-FEN metadata needed for post-processing
    black_flags: list[bool] = []
    per_fen_legal_indices: list[list[int]] = []

    for fen in fens:
        black_flag = fen.split(" ")[1] == "b"
        black_flags.append(black_flag)
        # All buckets share the same legal move set for a given FEN, so read it once.
        rep_rating_first = unique_buckets[bucket_order[0]]
        _, _, _, legal_moves_1d = preprocessing(
            fen, rep_rating_first, rep_rating_first, elo_dict, all_moves_dict
        )
        fen_legal_indices = legal_moves_1d.nonzero().flatten().tolist()
        per_fen_legal_indices.append(fen_legal_indices)

        for bucket in bucket_order:
            rep_rating = unique_buckets[bucket]
            board_input, elo_self_idx, elo_oppo_idx, legal_moves = preprocessing(
                fen, rep_rating, rep_rating, elo_dict, all_moves_dict
            )
            boards_list.append(board_input.unsqueeze(0))
            elos_self_list.append(elo_self_idx)
            elos_oppo_list.append(elo_oppo_idx)
            legal_moves_list.append(legal_moves.unsqueeze(0))

    boards = torch.cat(boards_list, dim=0).to(device)
    elos_self = torch.tensor(elos_self_list).to(device)
    elos_oppo = torch.tensor(elos_oppo_list).to(device)
    legal_moves_batch = torch.cat(legal_moves_list, dim=0).to(device)

    model.eval()
    with torch.no_grad():
        logits_maia, _, _ = model(boards, elos_self, elos_oppo)
        logits_maia_legal = logits_maia * legal_moves_batch
        probs_batch = logits_maia_legal.softmax(dim=-1).cpu()

    # --- Slice output back per-FEN per-bucket ---
    results: list[dict[int, dict[str, float]]] = []
    for fen_idx, fen in enumerate(fens):
        black_flag = black_flags[fen_idx]
        fen_legal_indices = per_fen_legal_indices[fen_idx]

        legal_moves_uci = [
            mirror_move(all_moves_dict_reversed[idx]) if black_flag else all_moves_dict_reversed[idx]
            for idx in fen_legal_indices
        ]

        bucket_probs: dict[int, dict[str, float]] = {}
        for bucket_offset, bucket in enumerate(bucket_order):
            row_idx = fen_idx * n_buckets + bucket_offset
            row = probs_batch[row_idx].tolist()
            move_probs = {
                legal_moves_uci[j]: round(row[fen_legal_indices[j]], 4)
                for j in range(len(fen_legal_indices))
            }
            move_probs = dict(sorted(move_probs.items(), key=lambda item: item[1], reverse=True))
            bucket_probs[bucket] = move_probs

        results.append(bucket_probs)

    return results


def infer_batch(model, prepared, fens: list[str]) -> dict:
    """
    Run Maia-2 inference for all 41 rating buckets across K FENs in a single
    forward pass (K*11 rows stacked into one tensor).

    Returns a dict ready to serialise as the /infer-batch API response body:
      {
        "maiaVersion": str,
        "ratingGrid": [600, 650, ..., 2600],
        "results": [
          {"fen": "...", "moveIndex": [...], "probabilities": [[...], ...]},
          ...
        ]
      }
    """
    bucket_for_rating, unique_buckets = _deduplicate_buckets(prepared)
    per_fen_bucket_probs = _run_batched_multi(model, prepared, fens, unique_buckets)

    results = []
    for fen, bucket_probs in zip(fens, per_fen_bucket_probs):
        move_index, probabilities = _build_probability_matrix(bucket_probs, bucket_for_rating)
        results.append({
            "fen": fen,
            "moveIndex": move_index,
            "probabilities": probabilities,
        })

    return {
        "maiaVersion": "maia2-rapid-v1.0",
        "ratingGrid": RATING_GRID,
        "results": results,
    }


def infer(model, prepared, fen: str, *, legacy: bool | None = None) -> dict:
    """
    Run Maia-2 inference for all 41 rating buckets in RATING_GRID.

    Deduplicates by model-internal ELO bucket, then runs either a single
    batched forward pass (default) or the original serial loop (legacy=True).

    Returns a dict ready to serialise as the API response body:
      {
        "maiaVersion": str,
        "ratingGrid": [600, 650, ..., 2600],
        "moveIndex": [uci, ...],         # length L
        "probabilities": [[...], ...],   # shape (41, L), row-major
      }
    """
    use_legacy = USE_LEGACY_INFERENCE if legacy is None else legacy

    bucket_for_rating, unique_buckets = _deduplicate_buckets(prepared)

    if use_legacy:
        bucket_probs = _run_legacy(model, prepared, fen, unique_buckets)
    else:
        bucket_probs = _run_batched(model, prepared, fen, unique_buckets)

    move_index, probabilities = _build_probability_matrix(bucket_probs, bucket_for_rating)

    return {
        "maiaVersion": "maia2-rapid-v1.0",
        "ratingGrid": RATING_GRID,
        "moveIndex": move_index,
        "probabilities": probabilities,
    }
