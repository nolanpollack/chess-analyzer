# uv run --with lightgbm --with numpy scripts/train-phase3.py --cache bench/cache/lichess_db_standard_rated_2026-03.jsonl --out bench/phase3-model.json

import argparse
import json
import math
import sys

import lightgbm as lgb
import numpy as np

# ── CLI args ──────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Train LightGBM ELO estimator (Phase 3)")
parser.add_argument("--cache", required=True, help="Path to JSONL cache file")
parser.add_argument("--out", required=True, help="Output path for model JSON")
parser.add_argument("--split", type=float, default=0.7, help="Train fraction (default 0.7)")
args = parser.parse_args()

# ── Load JSONL cache ──────────────────────────────────────────────────────────

def load_cache(path: str) -> list[dict]:
	games = []
	with open(path) as f:
		for line in f:
			line = line.strip()
			if line:
				games.append(json.loads(line))
	return games

# ── Seeded LCG shuffle (mirrors TypeScript seededShuffle with seed=42) ────────
# LCG: s = (s * 1664525 + 1013904223) & 0xffffffff
# Fisher-Yates descending from i = len-1 to 1

def seeded_shuffle(arr: list, seed: int = 42) -> list:
	out = list(arr)
	s = seed
	def rand() -> float:
		nonlocal s
		s = (s * 1664525 + 1013904223) & 0xffffffff
		return (s & 0xffffffff) / 0x100000000

	for i in range(len(out) - 1, 0, -1):
		j = math.floor(rand() * (i + 1))
		out[i], out[j] = out[j], out[i]
	return out

# ── Feature extraction (mirrors game-features.ts) ────────────────────────────

HIGH_COMPLEXITY_THRESHOLD = 5.0
BLUNDER_ACCURACY_THRESHOLD = 50
INACCURACY_ACCURACY_MAX = 80
TIME_PRESSURE_THRESHOLD_MS = 30_000

TC_CLASSES = ["bullet", "blitz", "rapid", "classical", "correspondence"]

FEATURE_NAMES = [
	"lichessAccuracy",
	"accuracyOnHighComplexity",
	"accuracyOnLowComplexity",
	"blunderRate",
	"inaccuracyRate",
	"meanCpl",
	"moveCount",
	"meanTimeFractionUsed",
	"blunderRateUnderPressure",
	"hasTimeData",
] + [f"tc_{tc}" for tc in TC_CLASSES]

def parse_increment_ms(time_control: str) -> int:
	import re
	m = re.match(r"^\d+\+(\d+)$", time_control)
	return int(m.group(1)) * 1000 if m else 0

def extract_game_features(game: dict, color: str) -> dict | None:
	is_white = color == "white"
	color_moves = [m for m in game["moves"] if m["isWhite"] == is_white]
	if not color_moves:
		return None

	# Lichess accuracy = mean of per-move accuracy
	lichess_accuracy = sum(m["accuracy"] for m in color_moves) / len(color_moves)

	# Complexity partition
	high_acc_sum = 0.0
	high_count = 0
	low_acc_sum = 0.0
	low_count = 0
	for m in color_moves:
		if m["complexity"] >= HIGH_COMPLEXITY_THRESHOLD:
			high_acc_sum += m["accuracy"]
			high_count += 1
		else:
			low_acc_sum += m["accuracy"]
			low_count += 1

	low_acc = low_acc_sum / low_count if low_count > 0 else 0.0
	high_acc = (high_acc_sum / high_count) if high_count > 0 else low_acc

	# Move quality
	blunder_count = 0
	inaccuracy_count = 0
	total_cpl = 0.0
	for m in color_moves:
		if m["accuracy"] < BLUNDER_ACCURACY_THRESHOLD:
			blunder_count += 1
		elif m["accuracy"] < INACCURACY_ACCURACY_MAX:
			inaccuracy_count += 1
		eval_before = m["evalBeforeCp"] if is_white else -m["evalBeforeCp"]
		eval_after = m["evalAfterCp"] if is_white else -m["evalAfterCp"]
		cpl = max(0.0, eval_before - eval_after)
		total_cpl += cpl

	blunder_rate = blunder_count / len(color_moves)
	inaccuracy_rate = inaccuracy_count / len(color_moves)
	mean_cpl = total_cpl / len(color_moves)

	# Time features
	all_moves = game["moves"]
	increment_ms = parse_increment_ms(game["timeControl"])
	has_all_clocks = all(m.get("clockMs") is not None for m in all_moves)

	mean_time_fraction = None
	blunder_rate_under_pressure = None

	if has_all_clocks and color_moves:
		total_time_fraction = 0.0
		pressure_blunders = 0
		pressure_moves = 0

		for m in color_moves:
			move_idx = m["ply"] - 1  # ply is 1-indexed
			prev_same_color_idx = move_idx - 2
			if prev_same_color_idx >= 0 and prev_same_color_idx < len(all_moves):
				clock_before = all_moves[prev_same_color_idx]["clockMs"]
			else:
				clock_before = m["clockMs"] + (-increment_ms if increment_ms > 0 else 0)

			time_spent = max(0, clock_before - m["clockMs"] + increment_ms)
			if clock_before > 0:
				total_time_fraction += time_spent / clock_before

			if clock_before < TIME_PRESSURE_THRESHOLD_MS:
				pressure_moves += 1
				if m["accuracy"] < BLUNDER_ACCURACY_THRESHOLD:
					pressure_blunders += 1

		mean_time_fraction = total_time_fraction / len(color_moves)
		blunder_rate_under_pressure = (pressure_blunders / pressure_moves) if pressure_moves > 0 else 0.0

	has_time = 1 if mean_time_fraction is not None else 0
	tc_one_hot = [1 if tc == game["timeControlClass"] else 0 for tc in TC_CLASSES]

	return {
		"lichessAccuracy": lichess_accuracy,
		"accuracyOnHighComplexity": high_acc,
		"accuracyOnLowComplexity": low_acc,
		"blunderRate": blunder_rate,
		"inaccuracyRate": inaccuracy_rate,
		"meanCpl": mean_cpl,
		"moveCount": float(len(color_moves)),
		"meanTimeFractionUsed": mean_time_fraction if mean_time_fraction is not None else 0.0,
		"blunderRateUnderPressure": blunder_rate_under_pressure if blunder_rate_under_pressure is not None else 0.0,
		"hasTimeData": float(has_time),
		**{f"tc_{tc}": float(v) for tc, v in zip(TC_CLASSES, tc_one_hot)},
	}

def build_feature_vector(feat: dict) -> list[float]:
	return [feat[name] for name in FEATURE_NAMES]

# ── Build dataset ─────────────────────────────────────────────────────────────

def build_dataset(games: list[dict]) -> tuple[np.ndarray, np.ndarray]:
	X_rows = []
	y_rows = []
	for game in games:
		for color in ("white", "black"):
			elo = game["whiteElo"] if color == "white" else game["blackElo"]
			feat = extract_game_features(game, color)
			if feat is None:
				continue
			X_rows.append(build_feature_vector(feat))
			y_rows.append(float(elo))
	return np.array(X_rows, dtype=np.float32), np.array(y_rows, dtype=np.float32)

# ── Metrics ───────────────────────────────────────────────────────────────────

def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
	return float(np.mean(np.abs(y_true - y_pred)))

def r2(y_true: np.ndarray, y_pred: np.ndarray) -> float:
	ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
	ss_res = float(np.sum((y_true - y_pred) ** 2))
	return 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

# ── Main ──────────────────────────────────────────────────────────────────────

print(f"Loading cache: {args.cache}")
all_games = load_cache(args.cache)
print(f"Total games: {len(all_games)}")

shuffled = seeded_shuffle(all_games, seed=42)
split_idx = math.floor(len(shuffled) * args.split)
train_games = shuffled[:split_idx]
test_games = shuffled[split_idx:]

print(f"Train games: {len(train_games)}  Test games: {len(test_games)}")
print(f"First 5 train game IDs: {[g['gameId'] for g in train_games[:5]]}")

X_train, y_train = build_dataset(train_games)
X_test, y_test = build_dataset(test_games)

print(f"Train data points: {len(X_train)}  Test data points: {len(X_test)}")
print(f"Features ({len(FEATURE_NAMES)}): {FEATURE_NAMES}")
print()

# ── 5-fold CV with early stopping to pick n_estimators ───────────────────────

print("Running 5-fold CV within train set...")

n_folds = 5
fold_size = len(X_train) // n_folds
best_n_estimators = 200
cv_maes = []

lgb_params = {
	"objective": "regression",
	"metric": "mae",
	"max_depth": 6,
	"learning_rate": 0.05,
	"min_data_in_leaf": 10,
	"num_leaves": 31,
	"lambda_l2": 0.1,
	"verbose": -1,
	"n_jobs": -1,
}

fold_best_iters = []

for fold in range(n_folds):
	val_start = fold * fold_size
	val_end = val_start + fold_size if fold < n_folds - 1 else len(X_train)

	X_val_fold = X_train[val_start:val_end]
	y_val_fold = y_train[val_start:val_end]
	X_tr_fold = np.concatenate([X_train[:val_start], X_train[val_end:]])
	y_tr_fold = np.concatenate([y_train[:val_start], y_train[val_end:]])

	dtrain = lgb.Dataset(X_tr_fold, label=y_tr_fold, feature_name=FEATURE_NAMES)
	dval = lgb.Dataset(X_val_fold, label=y_val_fold, reference=dtrain)

	callbacks = [lgb.early_stopping(stopping_rounds=30, verbose=False), lgb.log_evaluation(period=-1)]
	model_fold = lgb.train(
		lgb_params,
		dtrain,
		num_boost_round=500,
		valid_sets=[dval],
		callbacks=callbacks,
	)

	best_iter = model_fold.best_iteration
	fold_best_iters.append(best_iter)
	preds = model_fold.predict(X_val_fold, num_iteration=best_iter)
	fold_mae = mae(y_val_fold, preds)
	cv_maes.append(fold_mae)
	print(f"  Fold {fold+1}: best_iter={best_iter}  MAE={fold_mae:.1f}")

cv_mean_mae = float(np.mean(cv_maes))
best_n_estimators = int(round(float(np.mean(fold_best_iters))))
print(f"\nCV mean MAE: {cv_mean_mae:.1f}  |  avg best_iter: {best_n_estimators}")
print()

# ── Train final model on full train set ───────────────────────────────────────

print(f"Training final model with n_estimators={best_n_estimators}...")
dtrain_full = lgb.Dataset(X_train, label=y_train, feature_name=FEATURE_NAMES)
final_model = lgb.train(
	lgb_params,
	dtrain_full,
	num_boost_round=best_n_estimators,
	callbacks=[lgb.log_evaluation(period=-1)],
)

# ── Test set evaluation ───────────────────────────────────────────────────────

y_pred_test = final_model.predict(X_test)
test_mae_val = mae(y_test, y_pred_test)
test_r2_val = r2(y_test, y_pred_test)

print(f"Test MAE: {test_mae_val:.1f}")
print(f"Test R²:  {test_r2_val:.3f}")
print()

# ── Feature importance (gain) ─────────────────────────────────────────────────

importance_gain = final_model.feature_importance(importance_type="gain")
importance_split = final_model.feature_importance(importance_type="split")

print("Feature importance (gain):")
feat_imp = sorted(zip(FEATURE_NAMES, importance_gain, importance_split), key=lambda x: -x[1])
print(f"  {'Feature':<35}  {'Gain':>12}  {'Splits':>8}")
print(f"  {'─'*35}  {'─'*12}  {'─'*8}")
for name, gain, splits in feat_imp:
	print(f"  {name:<35}  {gain:>12.1f}  {splits:>8}")
print()

# ── Save model as portable JSON dump ──────────────────────────────────────────

model_dump = final_model.dump_model()
with open(args.out, "w") as f:
	json.dump(model_dump, f)

print(f"Model saved to: {args.out}")
print(f"Trees: {len(model_dump.get('tree_info', []))}")
