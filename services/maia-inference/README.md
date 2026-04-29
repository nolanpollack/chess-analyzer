# Maia-2 Inference Service

A minimal FastAPI HTTP service that loads the Maia-2 rapid chess model and
exposes rating-conditioned move probability distributions over legal moves.

## Setup

Requires [`uv`](https://docs.astral.sh/uv/).

```bash
cd services/maia-inference
uv sync
```

## Start the service

```bash
uv run uvicorn src.main:app --port 8765
```

Default port: **8765**.

On first startup the service downloads the Maia-2 rapid model weights (~280 MB)
from Google Drive into `./maia2_models/`. Subsequent startups load from disk.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `MAIA2_MODEL_DIR` | `./maia2_models` | Directory where model weights are cached |

## Endpoints

### `GET /health`

Readiness probe.

```json
{ "status": "ok", "ready": true }
```

### `POST /infer`

Request:

```json
{ "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" }
```

Response:

```json
{
  "maiaVersion": "maia2-rapid-v1.0",
  "ratingGrid": [600, 650, 700, ..., 2600],
  "moveIndex": ["a2a3", "a2a4", "b1c3", ...],
  "probabilities": [
    [0.002, 0.003, ...],
    ...
  ]
}
```

- `ratingGrid`: 41 ELO values from 600 to 2600 in steps of 50.
- `moveIndex`: UCI strings for all legal moves in the position, length L.
- `probabilities`: shape (41, L) row-major; `probabilities[i][j]` = P(move_j | fen, rating=ratingGrid[i]). Each row sums to 1.0.

Errors return HTTP 400 with `{ "error": "<message>" }`.

### Curl example

```bash
curl -s -X POST http://localhost:8765/infer \
  -H 'Content-Type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}' \
  | python3 -m json.tool | head -20
```

## Tests

```bash
uv run pytest tests/ -v
```

Tests skip automatically if the model weights are not yet downloaded.
Run the service once first (or `uv run python -c "from maia2.model import from_pretrained; from_pretrained('rapid','cpu')"`) to trigger the download.

## Implementation notes

### ELO bucket deduplication

Maia-2 internally maps any ELO to one of 11 coarse buckets
(`<1100`, `1100-1199`, ..., `>=2000`). Our 41-bucket grid is denser than
the model's internal resolution. The service deduplicates: only one forward
pass per unique model bucket is run, and results are broadcast to all
rating-grid rows that map to the same bucket. This means adjacent rows in
`probabilities` are often identical — the distinction is intentional so the
TS consumer gets a uniform-shape response regardless of model internals.

### Probability normalization

Maia-2 rounds each per-move probability to 4 decimal places, causing rows
to sum to ~0.97. The service renormalizes each row to sum to exactly 1.0
before returning.

### CPU-only

No GPU required. The service runs on CPU (`map_location='cpu'`).
