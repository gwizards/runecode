# RuFlo Memory Optimization: Scalar Quantization

## Overview
The claude-flow CLI uses HNSW (Hierarchical Navigable Small World) for vector search.
Scalar quantization converts float32 embeddings to uint8, reducing memory by 4x.

## Integration Point
When claude-flow v3 exposes a memory optimization API, use:
```bash
npx @claude-flow/cli@latest memory optimize --quantization scalar --dims 384
```

## Manual Approach (Current)
Until native support is added, embeddings can be quantized before storage:
- float32 range: [-1.0, 1.0] for normalized embeddings
- uint8 range: [0, 255]
- Formula: uint8 = round((float32 + 1.0) * 127.5)
- Dequantize: float32 = (uint8 / 127.5) - 1.0

## Expected Impact
- 384-dim float32: 384 × 4 bytes = 1536 bytes per vector
- 384-dim uint8: 384 × 1 byte = 384 bytes per vector
- 4x memory reduction, ~1% accuracy loss (acceptable for semantic search)
