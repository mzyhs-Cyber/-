#!/usr/bin/env python3
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_FILE = ROOT / "models" / "model-registry.csv"
CANDIDATE_FILE = ROOT / "candidates" / "public-candidate-template.csv"

EXPECTED_MODELS = {
    *(f"G0{i}" for i in range(1, 7)),
    *(f"L0{i}" for i in range(1, 6)),
    *(f"V0{i}" for i in range(1, 5)),
    *(f"Q0{i}" for i in range(1, 4)),
    *(f"D0{i}" for i in range(1, 5)),
    *(f"C0{i}" for i in range(1, 3)),
    "K01",
}

ALLOWED_STATUS = {
    "lead", "source-read", "content-complete", "independently-solved",
    "cross-checked", "model-matched", "eligible", "used", "retest-due",
    "hold-dedup", "reserved-stage-check", "retired",
}


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main():
    models = read_csv(MODEL_FILE)
    candidates = read_csv(CANDIDATE_FILE)
    ids = [row["model_id"] for row in models]
    assert len(ids) == 25, f"expected 25 models, got {len(ids)}"
    assert set(ids) == EXPECTED_MODELS, f"model mismatch: {set(ids) ^ EXPECTED_MODELS}"
    assert len(ids) == len(set(ids)), "duplicate model_id"

    candidate_ids = [row["candidate_key"] for row in candidates]
    assert len(candidate_ids) == len(set(candidate_ids)), "duplicate candidate_id"
    for row in candidates:
        assert row["model_id"] in EXPECTED_MODELS, row
        assert row["status"] in ALLOWED_STATUS, row
        assert row["status"] != "used", "public template must not reveal personal usage"
        assert "session" not in row["notes"].lower(), "public notes may not expose session IDs"

    print(f"OK: {len(models)} models, {len(candidates)} candidates")


if __name__ == "__main__":
    main()
