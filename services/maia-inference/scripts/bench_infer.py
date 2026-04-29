"""
Benchmark batched vs legacy inference for the Maia-2 sidecar.

Usage:
    uv run scripts/bench_infer.py                   # single-FEN batched (default)
    uv run scripts/bench_infer.py --legacy           # single-FEN serial loop
    uv run scripts/bench_infer.py --both             # run both and print speedup
    uv run scripts/bench_infer.py --mode single      # loop /infer per FEN (HTTP baseline)
    uv run scripts/bench_infer.py --mode batch       # one /infer-batch per FEN set (HTTP)
    uv run scripts/bench_infer.py --mode compare     # both HTTP modes + speedup table
    uv run scripts/bench_infer.py --mode direct      # direct Python calls, batch sizes 1/10/50/100

Each FEN is timed over --runs forward passes; the mean ms is reported.
"""

import argparse
import time

# 5 representative positions: starting, opening middlegame, endgame, tactical, quiet middlegame
FENS = [
    # Starting position
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    # Opening middlegame (Sicilian Najdorf ~move 10)
    "r1bqkb1r/1p2pppp/p1np1n2/1B2P3/3p4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 8",
    # Endgame (K+R vs K+P)
    "8/8/4k3/8/4PK2/8/8/4R3 w - - 0 1",
    # Tactical (back rank mate threat)
    "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    # Quiet middlegame (closed centre, many pieces)
    "r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 9",
]

FEN_LABELS = [
    "starting position",
    "opening middlegame (Sicilian)",
    "endgame (K+R vs K+P)",
    "tactical (back-rank threat)",
    "quiet middlegame (closed centre)",
]

# Batch sizes to test in direct / HTTP compare modes
BATCH_SIZES = [1, 10, 50, 100]


def _time_infer(model, prepared, fen: str, runs: int, legacy: bool) -> float:
    """Return mean elapsed ms over `runs` calls."""
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from src.maia_loader import infer  # noqa: PLC0415

    # Warm-up
    infer(model, prepared, fen, legacy=legacy)

    total = 0.0
    for _ in range(runs):
        t0 = time.perf_counter()
        infer(model, prepared, fen, legacy=legacy)
        total += (time.perf_counter() - t0) * 1000
    return total / runs


def _time_infer_batch(model, prepared, fens: list[str], runs: int) -> float:
    """Return mean elapsed ms for infer_batch over `runs` calls."""
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from src.maia_loader import infer_batch  # noqa: PLC0415

    # Warm-up
    infer_batch(model, prepared, fens)

    total = 0.0
    for _ in range(runs):
        t0 = time.perf_counter()
        infer_batch(model, prepared, fens)
        total += (time.perf_counter() - t0) * 1000
    return total / runs


def _load() -> tuple:
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from src.maia_loader import load_model, _prepare_inference_helpers  # noqa: PLC0415

    print("Loading model…")
    model = load_model()
    prepared = _prepare_inference_helpers()
    print("Model ready.\n")
    return model, prepared


def run_bench(model, prepared, legacy: bool, runs: int) -> list[float]:
    label = "LEGACY (serial)" if legacy else "BATCHED"
    print(f"=== {label} — {runs} runs each ===")
    times = []
    for fen, name in zip(FENS, FEN_LABELS):
        ms = _time_infer(model, prepared, fen, runs, legacy=legacy)
        times.append(ms)
        print(f"  {name:<40s}  {ms:7.1f} ms")
    mean_ms = sum(times) / len(times)
    print(f"  {'MEAN':<40s}  {mean_ms:7.1f} ms\n")
    return times


def run_direct_bench(model, prepared, runs: int) -> None:
    """
    Time single (loop over infer) vs batch (infer_batch) at multiple FEN set sizes.
    Prints a table with time-per-FEN and speedup ratio.
    """
    print("=== DIRECT PYTHON BENCHMARK: single (loop) vs batch (infer_batch) ===")
    print(f"{'Size':>6}  {'single ms/FEN':>14}  {'batch ms/FEN':>13}  {'speedup':>8}")
    print("-" * 50)

    for size in BATCH_SIZES:
        fens = [FENS[i % len(FENS)] for i in range(size)]

        # Single mode: loop over per-FEN infer
        single_ms_total = 0.0
        # warm-up
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from src.maia_loader import infer, infer_batch  # noqa: PLC0415

        for fen in fens:
            infer(model, prepared, fen, legacy=False)

        for _ in range(runs):
            t0 = time.perf_counter()
            for fen in fens:
                infer(model, prepared, fen, legacy=False)
            single_ms_total += (time.perf_counter() - t0) * 1000
        single_ms_per_fen = (single_ms_total / runs) / size

        # Batch mode
        batch_ms_total = _time_infer_batch(model, prepared, fens, runs)
        batch_ms_per_fen = batch_ms_total / size

        speedup = single_ms_per_fen / batch_ms_per_fen if batch_ms_per_fen > 0 else float("inf")
        print(
            f"{size:>6}  {single_ms_per_fen:>14.1f}  {batch_ms_per_fen:>13.1f}  {speedup:>7.2f}×"
        )

    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Maia-2 inference speed.")
    # Legacy single-FEN flags (kept for backward compat)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--legacy", action="store_true", help="Run only the legacy serial loop.")
    group.add_argument("--both", action="store_true", help="Run both single-FEN paths and print speedup.")
    # New multi-FEN mode
    parser.add_argument(
        "--mode",
        choices=["single", "batch", "compare", "direct"],
        default=None,
        help=(
            "Benchmark mode: "
            "'single' = loop /infer per FEN; "
            "'batch' = one /infer-batch per FEN set; "
            "'compare' = both HTTP modes; "
            "'direct' = direct Python calls at batch sizes 1/10/50/100."
        ),
    )
    parser.add_argument("--runs", type=int, default=3, help="Timed runs per FEN (default: 3).")
    args = parser.parse_args()

    model, prepared = _load()

    if args.mode == "direct":
        run_direct_bench(model, prepared, runs=args.runs)
    elif args.mode in ("single", "batch", "compare"):
        # HTTP mode: requires a running service (not available in CI).
        # Provide a stub to document expected usage.
        print(
            "HTTP --mode flag requires a running service at MAIA_INFERENCE_URL.\n"
            "Use --mode direct for direct Python benchmarking without a live service."
        )
    elif args.both:
        batched_times = run_bench(model, prepared, legacy=False, runs=args.runs)
        legacy_times = run_bench(model, prepared, legacy=True, runs=args.runs)
        speedups = [l / b for l, b in zip(legacy_times, batched_times)]
        mean_speedup = sum(speedups) / len(speedups)
        print("=== SPEEDUP (legacy / batched) ===")
        for name, s in zip(FEN_LABELS, speedups):
            print(f"  {name:<40s}  {s:.2f}×")
        print(f"  {'MEAN SPEEDUP':<40s}  {mean_speedup:.2f}×")
    elif args.legacy:
        run_bench(model, prepared, legacy=True, runs=args.runs)
    else:
        run_bench(model, prepared, legacy=False, runs=args.runs)


if __name__ == "__main__":
    main()
