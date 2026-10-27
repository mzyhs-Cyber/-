#!/usr/bin/env python3
import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_FILE = ROOT / "models" / "model-registry.csv"
CANDIDATE_FILE = ROOT / "candidates" / "public-candidate-template.csv"
VALUE_AUDIT_FILE = ROOT / "research" / "model-value-audit-2026-10-27.md"
VALUE_SCORE_FILE = ROOT / "research" / "model-value-scores-2026-10-27.csv"
SOURCE_LEDGER_FILE = ROOT / "research" / "web-source-ledger-2026-10-27.csv"

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

    audit_text = VALUE_AUDIT_FILE.read_text(encoding="utf-8")
    audited_ids = set(re.findall(r"^\| ([A-Z]\d{2}) ", audit_text, flags=re.MULTILINE))
    expected_audited = EXPECTED_MODELS - {"D02", "G04"}
    assert audited_ids == expected_audited, (
        f"23-model audit mismatch: {audited_ids ^ expected_audited}"
    )

    score_rows = read_csv(VALUE_SCORE_FILE)
    assert {row["model_id"] for row in score_rows} == expected_audited
    for row in score_rows:
        component_total = sum(
            int(row[key])
            for key in (
                "recurrence_30",
                "distinctiveness_30",
                "training_value_20",
                "candidate_supply_10",
                "source_confidence_10",
            )
        )
        assert component_total == int(row["total_100"]), row
        score = component_total
        expected_tier = "S" if score >= 85 else "A" if score >= 70 else "B" if score >= 55 else "C"
        assert row["tier"] == expected_tier, row

    sources = read_csv(SOURCE_LEDGER_FILE)
    assert len(sources) >= 10, "web source ledger needs multi-layer evidence"
    assert {"official", "institution", "self_media", "instructor_video", "social_video"} <= {
        row["source_layer"] for row in sources
    }, "source layers incomplete"

    candidate_ids = [row["candidate_key"] for row in candidates]
    assert len(candidate_ids) == len(set(candidate_ids)), "duplicate candidate_id"
    for row in candidates:
        assert row["model_id"] in EXPECTED_MODELS, row
        assert row["status"] in ALLOWED_STATUS, row
        assert row["status"] != "used", "public template must not reveal personal usage"
        assert "session" not in row["notes"].lower(), "public notes may not expose session IDs"

    print(
        f"OK: {len(models)} models, {len(audited_ids)} value-audited, "
        f"{len(candidates)} public examples, {len(sources)} web sources"
    )


if __name__ == "__main__":
    main()
