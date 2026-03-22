# Alpha Team: Quantization — Rust Migration Analysis

**Date:** 2026-03-22
**Analyst:** Team Alpha-1 (alpha-quantization)
**Files analyzed:**
- `src/domain/shared/quantization.ts` — 1,200 lines
- `src/domain/ruflo/quantization.ts` — 467 lines
- Supporting: `src/domain/ruflo/memory-store.ts` (imports from ruflo/quantization)

---

## Summary

The two quantization modules together implement four distinct subsystems: scalar field quantization for domain snapshot compaction, int8 vector quantization for HNSW embedding storage, product quantization (PQ) with k-means training for high-compression embedding storage, and calibrated per-dimension scalar quantization. All computation is pure numeric math with zero DOM, React, or Tauri-IPC dependencies; every hot loop is a strong SIMD candidate. The shared/quantization layer is tightly coupled to six TS domain repository types (agent, MCP, session, project, command, analytics), making a full migration require careful IPC boundary design — the kernel math should move to Rust while the TS-domain coupling layer remains a thin adapter.

---

## Computation Inventory

| Function / Class | File | Lines | Purpose | Rust Candidate? | Crate |
|---|---|---|---|---|---|
| `quantizeScalar` | shared | 63–72 | Asymmetric scalar quantization formula `q = clamp(round(x/scale + zp), min, max)` | Yes — pure math, no alloc | `bytemuck`, plain arithmetic |
| `dequantizeScalar` | shared | 79–81 | Inverse: `x̂ = (q - zp) * scale` | Yes | — |
| `deriveUint32Params` | shared | 90–99 | Derive scale + zeroPoint for uint32 range mapping | Yes | — |
| `quantizeVector` | shared | 117–133 | Per-vector symmetric int8 quantization; max-abs scan + element-wise clamp+round | Yes — strong SIMD (`i8x16`) | `wide`, `packed_simd2`, `std::simd` |
| `dequantizeVector` | shared | 141–147 | int8 → float32 reconstruction; element-wise multiply | Yes — trivial SIMD | same |
| `int8CosineSimilarity` | shared | 156–170 | Dot product + squared norms over int8 arrays; bottleneck for ANN search | Yes — critical SIMD path (`i16x8` accumulation) | `wide`, `simba`, `faer` |
| `ScalarQuantizer<T>` (abstract) | shared | 181–245 | Base class for snapshot encode/decode; timestamp helpers | Partial — timestamp helpers yes, class hierarchy stays in TS | — |
| `encodeTimestampMs` / `decodeTimestampMs` | shared | 200–208 | ms ↔ uint32 seconds; bitwise ops | Yes | — |
| `encodeIsoTimestamp` / `decodeIsoTimestamp` | shared | 215–228 | ISO string ↔ uint32 seconds | Partial — string parsing stays TS side | `chrono` |
| `AgentSnapshotQuantizer.encode/decode` | shared | 297–344 | Pack RawLiveAgent into typed arrays; enum-to-uint8 codecs | No — TS domain type coupling | — |
| `MCPSnapshotQuantizer.encode/decode` | shared | 407–465 | Pack RawMCPServer; transport + status + enabled flag packing | No — TS domain coupling | — |
| `AnalyticsSnapshotQuantizer.encode/decode` | shared | 505–559 | Pack RawConsent timestamps + status | No — TS domain coupling | — |
| `WorkspaceSnapshotQuantizer.encode/decode` | shared | 590–629 | Pack tab count + index into two uint8 fields | No — trivial; TS domain coupling | — |
| `SessionSnapshotQuantizer.encode/decode` | shared | 664–734 | Pack 5 uint32 token counts + status enum | No — TS domain coupling | — |
| `CommandSnapshotQuantizer.encode/decode` | shared | 768–843 | Pack scope + capability flags into uint8 bitfield | No — TS domain coupling | — |
| `ProjectSnapshotQuantizer.encode/decode` | shared | 863–909 | Pack two ISO timestamps → uint32 | Partial — uint32 encoding yes; TS domain no | — |
| `QuantizedSnapshotStore<T,K>` | shared | 924–1028 | In-memory map storing QuantizedBuffers; `searchNearest` linear scan over int8 | Partial — linear scan inner loop yes | `rayon` |
| `QuantizedSnapshotStore.searchNearest` | shared | 990–1027 | Quantize query + linear int8 cosine scan; sorts top-K | Yes — hot path | `rayon`, `wide` |
| `QuantizedVectorStore` | shared | 1052–1122 | Flat HNSW backing store; addVector, search (linear scan) | Yes — entire class | `ndarray`, `rayon`, `wide` |
| `QuantizedVectorStore.search` | shared | 1098–1109 | Linear int8 cosine scan over all entries; obvious rayon parallel | Yes — P1 | `rayon`, `wide` |
| `computeSavingsProjections` | shared | 1156–1199 | Arithmetic projection table — diagnostic utility | Low value; keep TS | — |
| `quantizeEmbedding` | ruflo | 13–19 | float32 → uint8 via `(v+1)*127.5`; element-wise | Yes | `wide` / SIMD |
| `dequantizeEmbedding` | ruflo | 23–29 | uint8 → float32 via `b/127.5 - 1.0` | Yes | same |
| `batchQuantize` | ruflo | 32–34 | Map `quantizeEmbedding` over embedding array | Yes — `rayon::par_iter` | `rayon` |
| `batchDequantize` | ruflo | 37–39 | Map `dequantizeEmbedding` over array | Yes — `rayon::par_iter` | `rayon` |
| `measureQuantizationError` | ruflo | 55–80 | maxErr, MAE, RMSE, SNR(dB); single-pass stats loop | Yes — pure math | — |
| `cosineSimilarityQuantized` | ruflo | 85–98 | Cosine over uint8 with shift to [-127.5, 127.5]; SIMD target | Yes — hot path | `wide`, SIMD |
| `ProductQuantizer.train` | ruflo | 158–172 | Calls `_kMeans` for each subspace; outer loop parallelizable | Yes — P1 | `rayon` |
| `ProductQuantizer._kMeans` | ruflo | 238–278 | K-means: assignment + centroid update; O(n·k·d) per iter | Yes — strongest compute kernel | `ndarray`, `rayon`, `nalgebra` |
| `ProductQuantizer._nearestCentroid` | ruflo | 280–292 | L2 distance scan over centroids; inner hot loop | Yes — SIMD | `wide`, `ndarray` |
| `ProductQuantizer.encode` | ruflo | 175–190 | Encode one embedding to PQ codes; calls `_nearestCentroid` per subspace | Yes | `ndarray` |
| `ProductQuantizer.decode` | ruflo | 193–206 | Reconstruct float32 from codebook centroids | Yes | `ndarray` |
| `ProductQuantizer.similarity` | ruflo | 209–220 | Asymmetric PQ cosine: decode both codes, compute cosine | Yes | `ndarray`, `nalgebra` |
| `ProductQuantizer.exportCodebook` / `importCodebook` | ruflo | 223–234 | JSON round-trip for persistence | Partial — serialization stays at IPC boundary | `serde_json` |
| `calibrate` | ruflo | 361–382 | Per-dimension min/max scan over sample corpus | Yes | `rayon`, `ndarray` |
| `quantizeCalibrated` | ruflo | 388–399 | Per-dim normalized quantization | Yes — SIMD | `wide` |
| `dequantizeCalibrated` | ruflo | 402–411 | Per-dim inverse | Yes — SIMD | `wide` |
| `CalibratedQuantizer` | ruflo | 422–467 | Stateful wrapper: fit → encode → decode; exportCalibration/importCalibration | Yes — entire struct | `serde`, `ndarray` |
| `recommendMode` | ruflo | 338–342 | Thresholded heuristic (3 branches) | Low value; keep TS | — |
| `quantizationSavings` | ruflo | 307–326 | Arithmetic report helper | Low value; keep TS | — |

---

## Migration Priority

### P1 — Migrate First (highest compute value, no TS coupling)

**Rationale:** These are pure compute kernels with no TypeScript domain type entanglement. They are called in hot paths during HNSW search, batch embedding operations, and PQ training. Moving them to Rust delivers the largest latency and throughput gain.

| Function / Class | Reason |
|---|---|
| `ProductQuantizer._kMeans` (ruflo, lines 238–278) | O(n·k·d) k-means is the dominant compute cost; 25-iter × 256 centroids × 384 dims is trivially parallelized with rayon |
| `ProductQuantizer._nearestCentroid` (ruflo, lines 280–292) | Inner loop of k-means and every encode(); pure L2 distance, textbook SIMD target |
| `QuantizedVectorStore.search` (shared, lines 1098–1109) | Linear int8 cosine scan — this is the HNSW candidate scoring path; rayon + SIMD gives ~10–20x throughput |
| `int8CosineSimilarity` (shared, lines 156–170) | Called once per candidate per search; accumulation overflows int8 so needs int16/int32 accumulation — Rust handles this safely |
| `batchQuantize` / `batchDequantize` (ruflo, lines 32–39) | Trivially parallel over independent vectors; rayon par_iter |
| `calibrate` (ruflo, lines 361–382) | Min/max scan over corpus — single rayon reduce pass |
| `quantizeVector` / `dequantizeVector` (shared, lines 117–147) | Per-vector SIMD; called during every HNSW insert |

### P2 — Migrate Second (good compute value, requires IPC boundary design)

**Rationale:** These have meaningful compute but either depend on serialization contracts or sit at the interface between the pure math layer and TS types.

| Function / Class | Reason |
|---|---|
| `CalibratedQuantizer` (ruflo, lines 422–467) | Stateful quantizer; the calibration arrays (min/scale Float32Array) serialize cleanly to JSON for the IPC boundary |
| `ProductQuantizer.encode` / `decode` / `similarity` (ruflo, lines 175–220) | Depend on the trained codebook state; once the codebook is moved to Rust the encode/decode ops follow naturally |
| `quantizeEmbedding` / `dequantizeEmbedding` (ruflo, lines 13–29) | Simple enough that the IPC overhead may dominate for single vectors; worth batching |
| `measureQuantizationError` (ruflo, lines 55–80) | Pure stats math; useful in Rust for benchmarking and validation tooling |
| `cosineSimilarityQuantized` (ruflo, lines 85–98) | Hot path for uint8 cosine; uint8 subtraction arithmetic is clean in Rust |
| `QuantizedSnapshotStore.searchNearest` (shared, lines 990–1027) | The inner int8 cosine loop is the same as `int8CosineSimilarity`; pull into Rust via the same command |

### P3 — Keep in TypeScript or Low Priority

**Rationale:** These are either trivially thin wrappers with negligible compute, tightly coupled to TS domain types that would require a full schema migration, or diagnostic/reporting utilities.

| Function / Class | Reason |
|---|---|
| All `*SnapshotQuantizer.encode/decode` (shared, lines 294–909) | Deeply coupled to 6 TS domain types (`RawLiveAgent`, `RawMCPServer`, `RawConsent`, `RawWorkspace`, `RawSession`, `RawCommandSnapshot`); migrating requires redefining all domain types in Rust and designing Serde schemas for each |
| `ScalarQuantizer<T>` abstract class (shared, lines 181–245) | Abstract class hierarchy; the TS-side adapter pattern is appropriate here |
| `QuantizedSnapshotStore<T,K>` Map wrapper (shared, lines 924–975) | Map + generic type machinery; the pure compute inner loop (searchNearest) is P2 but the container stays TS |
| `computeSavingsProjections` (shared, lines 1156–1199) | Diagnostic/reporting utility; 0 hot-path relevance |
| `recommendMode` (ruflo, lines 338–342) | 3-branch heuristic; negligible compute |
| `quantizationSavings` (ruflo, lines 307–326) | Arithmetic report; negligible |
| `encodeTimestampMs` / `decodeTimestampMs` (shared, lines 200–208) | Called at encode/decode time within TS-coupled snapshot quantizers |

---

## Rust Crate Recommendations

| Crate | Version (approx.) | Purpose |
|---|---|---|
| `ndarray` | 0.15 | Multi-dimensional float32/int8 arrays; replaces `Float32Array[][]` codebook layout in `ProductQuantizer` |
| `rayon` | 1.8 | Data parallelism for batch operations: `batchQuantize`, k-means assignment, linear ANN scan |
| `wide` | 0.7 | Portable SIMD: `i8x16`, `f32x8` lanes for int8 cosine inner loop and float32 quantize/dequantize |
| `bytemuck` | 1.14 | Safe cast between `&[u8]`, `&[i8]`, `&[f32]` for zero-copy buffer sharing with Tauri IPC |
| `half` | 2.3 | `f16` support if future half-precision quantization is introduced (not present today but a natural next step) |
| `serde` + `serde_json` | 1.0 | Serialize `PQCodebook` / `DimCalibration` for Tauri IPC and persistence; replaces `JSON.parse/stringify` round-trips |
| `nalgebra` | 0.32 | Optional: if symmetric cosine and L2 distance operations need BLAS-backed routines beyond what `ndarray` provides |
| `faer` | 0.18 | Optional: for any future SVD/PCA-based rotation before PQ (IVFPQ path); overkill for current code |

**Not needed:**
- `candle` — no ML model inference occurs; all computation is classical linear algebra
- `ort` (ONNX Runtime) — same reason; no neural net weights are loaded

---

## Risk and Effort Estimate

### shared/quantization.ts (1,200 lines)

| Subsystem | TS LOC | Estimated Rust LOC | Effort | Risk |
|---|---|---|---|---|
| Scalar math kernel (`quantizeScalar`, `dequantizeScalar`, `deriveUint32Params`) | ~40 | ~60 | 0.5 days | Low |
| Int8 vector kernel (`quantizeVector`, `dequantizeVector`, `int8CosineSimilarity`) | ~55 | ~90 | 1 day | Low — well-defined arithmetic |
| `QuantizedVectorStore` (including linear search) | ~70 | ~120 | 1.5 days | Medium — HashMap + lifetime for entries |
| `QuantizedSnapshotStore.searchNearest` hot loop | ~40 | ~70 | 0.5 days | Low |
| All `*SnapshotQuantizer` classes | ~600 | ~900 | 5 days | High — 6 domain types must be redefined in Rust with Serde, or IPC boundary must copy data per call |
| Timestamp helpers, savings projections | ~80 | N/A — keep in TS | 0 | N/A |

### ruflo/quantization.ts (467 lines)

| Subsystem | TS LOC | Estimated Rust LOC | Effort | Risk |
|---|---|---|---|---|
| Scalar quantize/dequantize (`quantizeEmbedding`, `dequantizeEmbedding`, batch variants) | ~30 | ~50 | 0.5 days | Low |
| Error metrics (`measureQuantizationError`) | ~25 | ~40 | 0.25 days | Low |
| Uint8 cosine similarity (`cosineSimilarityQuantized`) | ~14 | ~25 | 0.25 days | Low |
| `ProductQuantizer._kMeans` + `_nearestCentroid` | ~55 | ~100 | 2 days | Medium — centroid init strategy, convergence logic |
| `ProductQuantizer.encode` / `decode` / `similarity` | ~50 | ~80 | 1 day | Low |
| `ProductQuantizer.exportCodebook` / `importCodebook` | ~15 | ~30 | 0.5 days | Low — serde derives |
| `calibrate`, `quantizeCalibrated`, `dequantizeCalibrated` | ~55 | ~90 | 1 day | Low |
| `CalibratedQuantizer` (stateful wrapper) | ~50 | ~80 | 1 day | Low |
| Heuristics (`recommendMode`, `quantizationSavings`) | ~40 | N/A — keep in TS | 0 | N/A |

**Total estimated effort for P1+P2 migration:** ~10 engineer-days
**Total estimated new Rust LOC:** ~750–900 (TypeScript is more terse for class boilerplate; Rust adds explicit lifetimes, trait impls, error types, and serde derives)
**Test carry-over:** `src/domain/ruflo/quantization.test.ts` and `src/domain/shared/quantization.test.ts` round-trip tests can be directly ported to Rust `#[cfg(test)]` modules; property-based tests using `proptest` are recommended for the k-means convergence path.

### Risk summary

- **Low risk:** All pure math functions — deterministic, no side effects, straightforward to test with matching numerical assertions.
- **Medium risk:** `ProductQuantizer._kMeans` — the TypeScript implementation uses a simplified k-means++ init (first k vectors, not proper probabilistic seeding). A Rust port must preserve this exact behavior or test coverage will diverge. Also, the `Int8Array` accumulation for int8 cosine can overflow in TypeScript (JS uses float64 under the hood so it silently promotes); in Rust this must use `i32` or `i64` accumulators explicitly.
- **High risk:** The six `*SnapshotQuantizer` classes — the TS domain types (`RawLiveAgent`, `RawMCPServer`, etc.) are defined in adjacent domain modules and imported at lines 16–17, 469, 633, 738, 847. Migrating these to Rust requires either (a) duplicating the type definitions in Rust with full Serde compatibility and updating all six repository modules to call Tauri commands, or (b) accepting that these stay in TS and only the pure math kernel moves. Option (b) is strongly recommended for the initial migration.
- **Cross-platform:** No platform-specific APIs detected anywhere in either file. All typed array operations (`Float32Array`, `Int8Array`, `Uint8Array`) translate directly to Rust slice types. The only portability concern is SIMD intrinsics — use the `wide` crate (portable SIMD) rather than `std::arch` intrinsics to maintain Windows/macOS/Linux compatibility required by Tauri 2.x.

---

## Recommended Rust Module Path

```
src-tauri/src/quantization/
  mod.rs              — re-exports; feature flags for SIMD
  scalar.rs           — quantizeScalar, dequantizeScalar, deriveUint32Params
  vector.rs           — quantize_vector, dequantize_vector, int8_cosine_similarity
  product.rs          — ProductQuantizer struct, k-means, encode/decode/similarity
  calibrated.rs       — calibrate, quantize_calibrated, CalibratedQuantizer
  vector_store.rs     — QuantizedVectorStore (flat HNSW backing store)
  error.rs            — QuantizationError enum
  tests/
    scalar_tests.rs
    vector_tests.rs
    product_tests.rs
    calibrated_tests.rs
```

The `*SnapshotQuantizer` classes remain in TypeScript. They call the Rust math kernel via Tauri commands for any future compute-heavy operations (currently they do not; they are just field packing).

---

## IPC Contract (Tauri Commands to Expose)

All commands accept and return JSON-serializable types. Byte arrays are transmitted as base64-encoded strings or, for large batches, as Tauri `ArrayBuffer` transfers.

```rust
// P1 — Vector quantization (HNSW hot path)
#[tauri::command]
fn quantize_vector(floats: Vec<f32>) -> (Vec<i8>, f32)
// Returns (quantized_bytes, scale)

#[tauri::command]
fn dequantize_vector(quantized: Vec<i8>, scale: f32) -> Vec<f32>

#[tauri::command]
fn int8_cosine_similarity(a: Vec<i8>, b: Vec<i8>) -> f64

#[tauri::command]
fn batch_quantize_vectors(batch: Vec<Vec<f32>>) -> Vec<(Vec<i8>, f32)>

// P1 — Linear ANN scan (QuantizedVectorStore.search equivalent)
#[tauri::command]
fn search_quantized_store(
    query: Vec<f32>,
    store: Vec<(String, Vec<i8>)>,  // (key, int8_vector) pairs
    top_k: usize,
) -> Vec<(String, f64)>  // (key, score)

// P1 — Product quantization training
#[tauri::command]
fn train_product_quantizer(
    embeddings: Vec<Vec<f32>>,
    num_subspaces: usize,
    num_centroids: usize,
) -> ProductQuantizerState  // serialized codebook (serde JSON)

#[tauri::command]
fn pq_encode(embedding: Vec<f32>, state: ProductQuantizerState) -> Vec<u8>

#[tauri::command]
fn pq_decode(code: Vec<u8>, state: ProductQuantizerState) -> Vec<f32>

// P1 — Batch scalar quantization (ruflo embedding store)
#[tauri::command]
fn quantize_embeddings(batch: Vec<Vec<f32>>) -> Vec<Vec<u8>>
// float32 → uint8 via (v+1)*127.5

#[tauri::command]
fn dequantize_embeddings(batch: Vec<Vec<u8>>) -> Vec<Vec<f32>>

// P2 — Calibrated quantization
#[tauri::command]
fn calibrate_quantizer(samples: Vec<Vec<f32>>) -> CalibrationState
// Returns { min: Vec<f32>, scale: Vec<f32> }

#[tauri::command]
fn quantize_calibrated(floats: Vec<f32>, cal: CalibrationState) -> Vec<u8>

#[tauri::command]
fn dequantize_calibrated(bytes: Vec<u8>, cal: CalibrationState) -> Vec<f32>

// P2 — Error metrics (validation/benchmarking)
#[tauri::command]
fn measure_quantization_error(original: Vec<f32>) -> QuantizationErrorReport
// Returns { max_error, mean_error, rmse, snr_db }
```

**State management pattern:** The `ProductQuantizerState` and `CalibrationState` types are plain JSON-serializable structs. The TS caller trains once, receives the serialized state, stores it (in the existing `exportCodebook`/`exportCalibration` pattern), and passes it back on each encode/decode call. This is stateless from Rust's perspective — no `Mutex<HashMap>` needed for the math kernel. The `QuantizedVectorStore` map remains in TypeScript for simplicity, with only the inner cosine scan offloaded via `search_quantized_store`.

**When to use the command vs. in-process:** For single-vector operations the Tauri IPC overhead (~0.1–0.3ms per round-trip on desktop) may exceed the compute saving. Batch commands (`batch_quantize_vectors`, `search_quantized_store`) should be the primary interface. Single-vector commands are useful for validation and testing.

---

## Cross-Platform Notes

- No platform-specific APIs detected in either file.
- Tauri 2.x targets Windows (x86_64, aarch64), macOS (x86_64, aarch64/Apple Silicon), and Linux (x86_64). The recommended `wide` crate compiles to the best available SIMD on each target (SSE2/AVX2 on x86, NEON on ARM) without `#[cfg(target_arch)]` guards.
- The `half` crate (f16) is natively supported on Apple Silicon but falls back to software emulation on older x86 without AVX-512 FP16. Since the current code does not use f16, this is a future concern only.
- Windows: Rust's `rayon` thread pool works correctly on Windows. No WinAPI calls are needed.
- The existing `Int8Array` / `Float32Array` representations in TypeScript are directly analogous to `&[i8]` / `&[f32]` slices in Rust; no endianness issues exist since all computation is in-process.
