/**
 * Calibrate the accuracy → Elo formula per exact time control (e.g. "300+0").
 *
 * Streams a Lichess PGN database (local file, local .zst, URL, or stdin),
 * extracts %eval annotations and player ratings, computes game accuracy using
 * our pipeline, fits a linear regression per time control, and writes
 * calibrated coefficients to src/config/rating-formula.json.
 *
 * Sampling is stratified: up to SAMPLES_PER_BUCKET data points are collected
 * per (time_control × 100-Elo bucket), so the regression is not dominated by
 * the most common rating range. Streaming stops automatically once no new data
 * has been collected for SATURATION_THRESHOLD consecutive games.
 *
 * Usage:
 *   bun scripts/calibrate-rating-formula.ts <file.pgn>
 *   bun scripts/calibrate-rating-formula.ts <file.pgn.zst>
 *   bun scripts/calibrate-rating-formula.ts https://database.lichess.org/...pgn.zst
 *   zstd -d -c file.pgn.zst | bun scripts/calibrate-rating-formula.ts
 *
 * Download PGN databases from https://database.lichess.org/
 */

import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { join } from "node:path";
import { computeGameAccuracy } from "#/lib/scoring/game-accuracy";

// ── Config ─────────────────────────────────────────────────────────────────────

const SAMPLES_PER_BUCKET = 20;
const MIN_POINTS_FOR_REGRESSION = 50;
const PROGRESS_INTERVAL_MS = 1000;
/** Stop once this many consecutive games yield no new data points. */
const SATURATION_THRESHOLD = 10_000;

// ── Types ───────────────────────────────────────────────────────────────────────

type DataPoint = { accuracy: number; rating: number };

type RegressionResult = {
	slope: number;
	offset: number;
	r2: number;
	sampleSize: number;
};

type GameHeaders = {
	whiteElo: number;
	blackElo: number;
	timeControl: string;
};

// ── Input stream ────────────────────────────────────────────────────────────────

type InputStream = {
	input: NodeJS.ReadableStream;
	totalBytes: number; // 0 = unknown (no ETA shown)
	label: string;
	proc?: ReturnType<typeof Bun.spawn>;
};

function openInputStream(arg: string | undefined): InputStream {
	if (!arg) {
		return { input: process.stdin, totalBytes: 0, label: "stdin" };
	}

	if (arg.startsWith("http://") || arg.startsWith("https://")) {
		// Stream URL through curl | zstd -d without downloading to disk.
		const proc = Bun.spawn(["sh", "-c", `curl -sL "${arg}" | zstd -d`], {
			stdout: "pipe",
			stderr: "ignore",
		});
		return {
			input: Readable.fromWeb(proc.stdout as ReadableStream<Uint8Array>),
			totalBytes: 0,
			label: arg,
			proc,
		};
	}

	if (arg.endsWith(".zst")) {
		const proc = Bun.spawn(["zstd", "-d", "-c", arg], {
			stdout: "pipe",
			stderr: "ignore",
		});
		// statSync gives compressed size but bytesRead tracks decompressed — don't show %.
		return {
			input: Readable.fromWeb(proc.stdout as ReadableStream<Uint8Array>),
			totalBytes: 0,
			label: arg,
			proc,
		};
	}

	let totalBytes = 0;
	try {
		totalBytes = statSync(arg).size;
	} catch {}
	return { input: createReadStream(arg), totalBytes, label: arg };
}

// ── Bucket sampling ─────────────────────────────────────────────────────────────

const bucketCounts = new Map<string, number>();

function bucketKey(timeControl: string, rating: number): string {
	return `${timeControl}:${Math.floor(rating / 100) * 100}`;
}

function bucketNeeded(timeControl: string, rating: number): boolean {
	return (bucketCounts.get(bucketKey(timeControl, rating)) ?? 0) < SAMPLES_PER_BUCKET;
}

function tryAdd(
	dataByTC: Map<string, DataPoint[]>,
	timeControl: string,
	point: DataPoint,
): boolean {
	const key = bucketKey(timeControl, point.rating);
	if ((bucketCounts.get(key) ?? 0) >= SAMPLES_PER_BUCKET) return false;
	bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
	if (!dataByTC.has(timeControl)) dataByTC.set(timeControl, []);
	dataByTC.get(timeControl)!.push(point);
	return true;
}

// ── PGN parsing — split into cheap (headers) and expensive (evals) ─────────────

function parseHeaders(lines: string[]): GameHeaders | null {
	let whiteElo = 0, blackElo = 0, timeControl = "";
	for (const line of lines) {
		if (!line.startsWith("[")) break; // headers always come first
		const m = line.match(/^\[(\w+)\s+"(.*)"\]$/);
		if (!m) continue;
		if (m[1] === "WhiteElo") whiteElo = Number(m[2]);
		else if (m[1] === "BlackElo") blackElo = Number(m[2]);
		else if (m[1] === "TimeControl") timeControl = m[2];
	}
	if (!whiteElo || !blackElo || !timeControl || timeControl === "-") return null;
	return { whiteElo, blackElo, timeControl };
}

function extractEvals(lines: string[]): number[] {
	const moveText = lines.filter((l) => !l.startsWith("[")).join(" ");
	const evals: number[] = [];
	const re = /\[%eval\s+(#-?\d+|-?\d+\.?\d*)\]/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(moveText)) !== null) {
		const raw = match[1];
		if (raw.startsWith("#")) {
			evals.push(Number(raw.slice(1)) >= 0 ? 100000 : -100000);
		} else {
			evals.push(Math.round(Number(raw) * 100));
		}
	}
	return evals;
}

// ── Game processing ─────────────────────────────────────────────────────────────

function computeDataPoints(
	evals: number[],
	whiteElo: number,
	blackElo: number,
): DataPoint[] {
	const moveEvals = evals.map((evalAfter, i) => ({
		evalBefore: i === 0 ? 0 : evals[i - 1],
		evalAfter,
		isWhite: i % 2 === 0,
	}));
	const accuracy = computeGameAccuracy(moveEvals);
	if (!accuracy) return [];
	return [
		{ accuracy: accuracy.white, rating: whiteElo },
		{ accuracy: accuracy.black, rating: blackElo },
	];
}

// ── Progress display ────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	return `${m}m ${s % 60}s`;
}

function fmtBytes(b: number): string {
	if (b < 1e6) return `${(b / 1e3).toFixed(0)}KB`;
	if (b < 1e9) return `${(b / 1e6).toFixed(1)}MB`;
	return `${(b / 1e9).toFixed(2)}GB`;
}

// ── Linear regression ───────────────────────────────────────────────────────────

function linearRegression(points: DataPoint[]): RegressionResult {
	const n = points.length;
	if (n < 2) return { slope: 40, offset: -1200, r2: 0, sampleSize: n };

	let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
	for (const { accuracy: x, rating: y } of points) {
		sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
	}
	const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
	const offset = (sumY - slope * sumX) / n;

	const meanY = sumY / n;
	let ssTot = 0, ssRes = 0;
	for (const { accuracy: x, rating: y } of points) {
		ssTot += (y - meanY) ** 2;
		ssRes += (y - (slope * x + offset)) ** 2;
	}
	return { slope, offset, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, sampleSize: n };
}

// ── Output writers ──────────────────────────────────────────────────────────────

function writeConfig(results: Map<string, RegressionResult>) {
	const data: Record<string, RegressionResult> = {};
	for (const [tc, reg] of results) data[tc] = reg;
	const outPath = join(import.meta.dir, "../src/config/rating-formula.json");
	writeFileSync(outPath, `${JSON.stringify(data, null, "\t")}\n`, "utf-8");
	console.log(`Wrote ${outPath}`);
}

function writeChart(
	dataByTC: Map<string, DataPoint[]>,
	results: Map<string, RegressionResult>,
) {
	const estimatedSeconds = (tc: string) => {
		const m = tc.match(/^(\d+)\+(\d+)$/);
		return m ? Number(m[1]) + 40 * Number(m[2]) : 0;
	};
	const sorted = [...results.keys()].sort(
		(a, b) => estimatedSeconds(a) - estimatedSeconds(b),
	);
	const chartConfigs = sorted.map((tc) => {
		const points = dataByTC.get(tc) ?? [];
		const reg = results.get(tc)!;
		const minAcc = Math.min(...points.map((p) => p.accuracy));
		const maxAcc = Math.max(...points.map((p) => p.accuracy));
		return {
			tc,
			scattered: points.map((p) => ({ x: p.accuracy, y: p.rating })),
			lineData: [
				{ x: minAcc, y: reg.slope * minAcc + reg.offset },
				{ x: maxAcc, y: reg.slope * maxAcc + reg.offset },
			],
			formula: `Elo = ${reg.slope.toFixed(1)} × acc + ${reg.offset.toFixed(0)}`,
			r2: reg.r2.toFixed(3),
			n: reg.sampleSize,
		};
	});

	const cols = Math.min(3, chartConfigs.length);
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Accuracy → Elo calibration</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; background: #111; color: #eee; margin: 0; padding: 24px; }
    h1 { font-size: 1.1rem; font-weight: 600; margin-bottom: 24px; color: #aaa; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 20px; }
    .card { background: #1a1a1a; border-radius: 8px; padding: 16px; }
    .card h2 { font-size: 0.85rem; font-weight: 600; margin: 0 0 2px; font-family: monospace; }
    .meta { font-size: 0.72rem; color: #888; margin-bottom: 10px; }
  </style>
</head>
<body>
  <h1>Accuracy → Elo calibration · ${new Date().toLocaleDateString()}</h1>
  <div class="grid" id="grid"></div>
  <script>
    const charts = ${JSON.stringify(chartConfigs)};
    for (const c of charts) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<h2>' + c.tc + '</h2>' +
        '<div class="meta">' + c.formula + ' &nbsp;·&nbsp; R²=' + c.r2 + ' &nbsp;·&nbsp; n=' + c.n + '</div>' +
        '<canvas id="c-' + c.tc.replace(/[^a-z0-9]/gi, '_') + '"></canvas>';
      document.getElementById('grid').appendChild(card);
      new Chart(document.getElementById('c-' + c.tc.replace(/[^a-z0-9]/gi, '_')), {
        data: {
          datasets: [
            { type: 'scatter', label: 'Games', data: c.scattered,
              pointRadius: 2, pointBackgroundColor: 'rgba(99,179,237,0.35)', pointBorderWidth: 0 },
            { type: 'line', label: 'Regression', data: c.lineData,
              borderColor: 'rgba(252,129,74,0.9)', borderWidth: 2, pointRadius: 0, tension: 0 },
          ],
        },
        options: {
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { title: { display: true, text: 'Accuracy (%)', color: '#888' },
                 ticks: { color: '#666' }, grid: { color: '#222' } },
            y: { title: { display: true, text: 'Rating', color: '#888' },
                 ticks: { color: '#666' }, grid: { color: '#222' } },
          },
        },
      });
    }
  </script>
</body>
</html>`;

	const buildDir = join(import.meta.dir, "../build");
	mkdirSync(buildDir, { recursive: true });
	const outPath = join(buildDir, "calibration-chart.html");
	writeFileSync(outPath, html, "utf-8");
	console.log(`Wrote ${outPath}`);
}

// ── Main ────────────────────────────────────────────────────────────────────────

const { input, totalBytes, label, proc } = openInputStream(process.argv[2]);
const rl = createInterface({ input, crlfDelay: Infinity });

const dataByTC = new Map<string, DataPoint[]>();
let gameLines: string[] = [];
let bytesRead = 0;
let gamesScanned = 0;
let gamesUsed = 0;
let totalPoints = 0;
let gamesSinceLastNewPoint = 0;
const startMs = Date.now();
let lastProgressMs = 0;

console.log(`Streaming PGN from ${label}${totalBytes > 0 ? ` (${fmtBytes(totalBytes)})` : ""}...`);
console.log(`Stratified sampling: up to ${SAMPLES_PER_BUCKET} points per (time control × 100-Elo bucket).`);
console.log(`Early exit after ${SATURATION_THRESHOLD.toLocaleString()} consecutive games with no new data.\n`);

function printProgress(final = false) {
	const now = Date.now();
	if (!final && now - lastProgressMs < PROGRESS_INTERVAL_MS) return;
	lastProgressMs = now;

	const elapsed = now - startMs;
	const parts: string[] = [];

	if (totalBytes > 0) {
		const pct = Math.min(100, (bytesRead / totalBytes) * 100);
		const eta = pct > 0.5 ? fmtDuration((elapsed / pct) * (100 - pct)) : "…";
		parts.push(`${pct.toFixed(1)}%  ETA ${eta}`);
	} else {
		parts.push(`${fmtDuration(elapsed)} elapsed`);
	}

	parts.push(`${gamesScanned.toLocaleString()} games scanned`);
	parts.push(`${totalPoints.toLocaleString()} points collected`);
	parts.push(`${dataByTC.size} time controls`);

	process.stdout.write(`\r  ${parts.join("  |  ")}    `);
}

function processBuffer() {
	if (gameLines.length === 0) return;
	gamesScanned++;

	const prevTotalPoints = totalPoints;

	const headers = parseHeaders(gameLines);
	if (headers) {
		const { whiteElo, blackElo, timeControl } = headers;

		if (bucketNeeded(timeControl, whiteElo) || bucketNeeded(timeControl, blackElo)) {
			const evals = extractEvals(gameLines);
			if (evals.length >= 10) {
				const points = computeDataPoints(evals, whiteElo, blackElo);
				for (const point of points) {
					if (tryAdd(dataByTC, timeControl, point)) {
						totalPoints++;
						gamesUsed++;
					}
				}
			}
		}
	}

	if (totalPoints > prevTotalPoints) {
		gamesSinceLastNewPoint = 0;
	} else {
		gamesSinceLastNewPoint++;
	}

	gameLines = [];
	printProgress();
}

let saturated = false;
for await (const line of rl) {
	bytesRead += line.length + 1; // +1 for newline
	if (line.startsWith("[Event ") && gameLines.length > 0) {
		processBuffer();
		if (gamesSinceLastNewPoint >= SATURATION_THRESHOLD) {
			saturated = true;
			break;
		}
	}
	gameLines.push(line);
}
if (!saturated) processBuffer(); // process last game if we reached end of file

rl.close();
proc?.kill();

printProgress(true);
const reason = saturated
	? `Saturated (no new data in ${SATURATION_THRESHOLD.toLocaleString()} games).`
	: "File complete.";
console.log(`\n\n${reason}`);
console.log(`${gamesScanned.toLocaleString()} games scanned, ${gamesUsed.toLocaleString()} used, ${totalPoints.toLocaleString()} data points collected in ${fmtDuration(Date.now() - startMs)}.\n`);

// Fit and report
const results = new Map<string, RegressionResult>();
const estimatedSeconds = (tc: string) => {
	const m = tc.match(/^(\d+)\+(\d+)$/);
	return m ? Number(m[1]) + 40 * Number(m[2]) : 0;
};
const sortedTCs = [...dataByTC.keys()].sort(
	(a, b) => estimatedSeconds(a) - estimatedSeconds(b),
);

console.log("=== Regression results (sorted by time) ===");
for (const tc of sortedTCs) {
	const points = dataByTC.get(tc)!;
	if (points.length < MIN_POINTS_FOR_REGRESSION) continue;
	const reg = linearRegression(points);
	results.set(tc, reg);
	console.log(
		`  ${tc.padEnd(12)} n=${String(reg.sampleSize).padStart(6)}  ` +
		`Elo = ${reg.slope.toFixed(1)} × acc + ${reg.offset.toFixed(0)}  ` +
		`R²=${reg.r2.toFixed(3)}`,
	);
}

writeConfig(results);
writeChart(dataByTC, results);
