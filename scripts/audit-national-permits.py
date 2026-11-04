"""Download official nationwide CSVs and audit them without a database.

Python 3.11+ standard library only. Raw files stay in ignored data/.
No service key, no DB access, no API pagination beyond the public preview.
"""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {
    "beauty_salons": ("미용업", "15154918"),
    "karaoke_rooms": ("노래연습장업", "15155135"),
    "general_restaurants": ("일반음식점", "15154916"),
}
FIELDS = ["개방자치단체코드", "관리번호", "사업장명", "인허가일자", "폐업일자",
          "영업상태코드", "영업상태명", "상세영업상태코드", "상세영업상태명",
          "도로명주소", "지번주소", "업태구분명", "좌표정보(X)", "좌표정보(Y)",
          "최종수정시점", "데이터갱신시점", "데이터갱신구분"]
API_FIELDS = ["OPN_ATMY_GRP_CD", "MNG_NO", "BPLC_NM", "LCPMT_YMD", "CLSBIZ_YMD",
              "SALS_STTS_CD", "SALS_STTS_NM", "DTL_SALS_STTS_CD", "DTL_SALS_STTS_NM",
              "ROAD_NM_ADDR", "LOTNO_ADDR", "BZSTAT_SE_NM", "CRD_INFO_X", "CRD_INFO_Y",
              "LAST_MDFCN_PNT", "DAT_UPDT_PNT", "DAT_UPDT_SE"]


def request(url, referer):
    return urllib.request.urlopen(urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (PermitMap public-data audit)", "Referer": referer,
    }), timeout=60)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def download(slug, directory, *, max_bytes=1024 * 1024 * 1024):
    if not re.fullmatch(r"[a-z0-9_]+", slug):
        raise ValueError("Invalid service slug")
    target = directory / f"{slug}.csv"
    if target.exists():
        print(f"Using existing raw file: {target}", flush=True)
        return target
    referer = f"https://sample.localdata.go.kr/public/{slug}/info"
    # Follow the official UI's download-count check. Fail on 403/429; no bypass/retry.
    with request("https://sample.localdata.go.kr/file/validate/download-count", referer) as response:
        response.read()
    url = f"https://file.localdata.go.kr/file/download/{slug}/info"
    partial = target.with_suffix(".csv.part")
    directory.mkdir(parents=True, exist_ok=True)
    count = 0
    digest = hashlib.sha256()
    with request(url, referer) as response, partial.open("wb") as output:
        # Do not persist cookies, session identifiers or CSP nonces.
        headers = {key: response.headers[key] for key in
                   ["Content-Type", "Content-Length", "Content-Disposition", "Date", "ETag", "Last-Modified"]
                   if response.headers.get(key) is not None}
        content_type = response.headers.get("Content-Type", "").lower()
        if "html" in content_type or "json" in content_type:
            raise ValueError("File server returned an error document instead of CSV")
        if response.headers.get("Content-Length") and int(response.headers["Content-Length"]) > max_bytes:
            raise ValueError("Raw download exceeds the configured byte limit")
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            if count > max_bytes:
                raise ValueError("Raw download exceeds the 1 GiB audit limit")
            output.write(chunk)
            digest.update(chunk)
            if count % (16 * 1024 * 1024) == 0:
                print(f"{slug}: downloaded {count // (1024 * 1024)} MiB", flush=True)
    if headers.get("Content-Length") and count != int(headers["Content-Length"]):
        raise ValueError("Downloaded byte count does not match Content-Length")
    if count == 0:
        raise ValueError("Downloaded file is empty")
    # Publish the byte provenance before the completed CSV. A .part file is never reused.
    write_json(target.with_suffix(".download.json"), {
        "url": url, "downloaded_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "bytes": count, "sha256": digest.hexdigest(), "response_headers": headers,
        "note": "Raw bytes preserved; HTTP charset is not assumed to match CSV encoding.",
    })
    partial.replace(target)
    return target


def audit(slug, path, output_dir, *, category=None, expected_sha256=None):
    with path.open("rb") as raw:
        raw_hash = hashlib.file_digest(raw, "sha256").hexdigest()
    if expected_sha256 and raw_hash != expected_sha256:
        raise ValueError("Existing CSV differs from the catalog's audited baseline")
    metadata = path.with_suffix(".download.json")
    provenance = json.loads(metadata.read_text(encoding="utf-8")) if metadata.exists() else None
    if provenance:
        if provenance["bytes"] != path.stat().st_size:
            raise ValueError("Raw file size differs from download provenance")
        if provenance.get("sha256") and provenance["sha256"] != raw_hash:
            raise ValueError("Raw file hash differs from download provenance")
    labels = {field: field for field in FIELDS}
    if category:
        schema = {field["name"]: field["label"] for field in category["fields"]}
        labels = {canonical: schema[api] for api, canonical in zip(API_FIELDS, FIELDS) if schema.get(api)}
    # Inspect header bytes only to select a codec, then strictly decode the entire file.
    with path.open("rb") as source:
        first_line = source.readline()
    try:
        first_line.decode("utf-8-sig")
        encoding = "utf-8-sig"
    except UnicodeDecodeError:
        first_line.decode("cp949")
        encoding = "cp949"
    counts = collections.Counter()
    statuses = collections.Counter()
    regions = collections.Counter()
    opened_years = collections.Counter()
    closed_years = collections.Counter()
    seen = set()
    seen_management = set()
    earliest = {}
    latest = {}
    samples = []
    sample_buckets = collections.Counter()
    date_errors = []
    updated_min = updated_max = None
    as_of_date = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    with path.open(encoding=encoding, newline="") as source:
        reader = csv.DictReader(source, strict=True)
        headers = reader.fieldnames or []
        if not headers or len(headers) != len(set(headers)):
            raise ValueError("CSV has empty or duplicate header names")
        required = set(labels.values())
        missing = required - set(headers)
        if missing:
            raise ValueError(f"Required header fields missing: {sorted(missing)}")
        date_fields = {prefix: labels.get(field) in headers for field, prefix in
                       [("인허가일자", "permitted"), ("폐업일자", "closed")]}
        for line, row in enumerate(reader, 2):
            counts["rows"] += 1
            if None in row or any(v is None for v in row.values()):
                counts["ragged_rows"] += 1
                continue
            row = {canonical: row[label].strip() for canonical, label in labels.items() if label in row}
            key = (row["개방자치단체코드"], row["관리번호"])
            if not all(key): counts["missing_identity"] += 1
            if key in seen: counts["duplicate_identity"] += 1
            seen.add(key)
            if key[1] in seen_management: counts["duplicate_management_number"] += 1
            seen_management.add(key[1])
            regions[key[0]] += 1
            statuses[f'{row.get("영업상태코드", "")}:{row.get("영업상태명", "")} / {row.get("상세영업상태코드", "")}:{row.get("상세영업상태명", "")}'] += 1
            parsed = {}
            for field, prefix, histogram in [("인허가일자", "permitted", opened_years), ("폐업일자", "closed", closed_years)]:
                if field not in row:
                    continue  # Unsupported by this schema, not a per-row missing value.
                value = row[field]
                if not value:
                    counts[f"{prefix}_missing"] += 1
                    continue
                try:
                    if re.fullmatch(r"\d{8}", value):
                        value = f"{value[:4]}-{value[4:6]}-{value[6:]}"
                    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                        raise ValueError("Unsupported source date format")
                    date = dt.date.fromisoformat(value)
                    parsed[prefix] = date
                    histogram[str(date.year)] += 1
                    earliest[prefix] = min(earliest.get(prefix, date), date)
                    latest[prefix] = max(latest.get(prefix, date), date)
                    if date > as_of_date: counts[f"{prefix}_future"] += 1
                    if date.year < 1950: counts[f"{prefix}_before_1950_review"] += 1
                except ValueError:
                    counts[f"{prefix}_invalid"] += 1
                    if len(date_errors) < 10: date_errors.append({"line": line, "field": field, "value": row[field]})
            if "closed" in parsed and "permitted" in parsed and parsed["closed"] < parsed["permitted"]:
                counts["closed_before_permitted"] += 1
            x, y = row.get("좌표정보(X)", ""), row.get("좌표정보(Y)", "")
            if not x or not y:
                counts["coordinate_missing"] += 1
                if bool(x) != bool(y): counts["coordinate_partial"] += 1
            else:
                try:
                    valid = all(math.isfinite(v) for v in (float(x), float(y))) and not (float(x) == 0 and float(y) == 0)
                except ValueError:
                    valid = False
                counts["coordinate_numeric_pair" if valid else "coordinate_invalid"] += 1
            if not row.get("도로명주소", ""): counts["road_address_missing"] += 1
            if date_fields["closed"] and row.get("영업상태명") == "폐업" and "closed" not in parsed:
                counts["closed_status_without_valid_date"] += 1
            updated = row.get("데이터갱신시점", "")
            if updated:
                updated_min = min(updated_min or updated, updated)
                updated_max = max(updated_max or updated, updated)
            # 20 projected rows: first 5 for four data-quality/date groups. Not statistical sampling.
            bucket = "missing_coordinate" if not x or not y else "old_closed" if parsed.get("closed", dt.date.max).year < 2010 else "closed" if "closed" in parsed else "other"
            if sample_buckets[bucket] < 5:
                samples.append({k: row.get(k, "") for k in FIELDS if k in labels})
                sample_buckets[bucket] += 1
    # Optional official current region mapping; keep source group IDs verbatim.
    mapping_path = output_dir / "municipalities.json"
    region_groups = collections.Counter()
    unmapped_regions = {}
    if mapping_path.exists():
        mapping = json.loads(mapping_path.read_text(encoding="utf-8"))["organizations"]
        for code, count in regions.items():
            if code in mapping: region_groups[mapping[code]["province_group"]] += count
            else: unmapped_regions[code] = count
    report = {
        "category": category["name"] if category else CATEGORIES[slug][0], "slug": slug,
        "official_catalog": category.get("official_catalog_url") if category else f"https://www.data.go.kr/data/{CATEGORIES[slug][1]}/openapi.do",
        "source_schema_sha256": category.get("schema_sha256") if category else None,
        "source_page": category.get("public_page_url") if category else None,
        "source_field_mapping": labels, "date_field_support": date_fields,
        "raw_sha256": raw_hash, "raw_bytes": path.stat().st_size, "encoding": encoding,
        "download": provenance,
        "quality_as_of_date": as_of_date.isoformat(),
        "audited_at": dt.datetime.now(dt.timezone.utc).isoformat(), "headers": headers,
        "counts": dict(counts), "region_counts": dict(sorted(regions.items())),
        "current_source_region_groups": dict(sorted(region_groups.items())),
        "unmapped_region_counts": unmapped_regions,
        "status_counts": dict(statuses.most_common()),
        "date_min": {k: v.isoformat() for k, v in earliest.items()},
        "date_max": {k: v.isoformat() for k, v in latest.items()},
        "permitted_by_year": dict(sorted(opened_years.items())),
        "closed_by_year": dict(sorted(closed_years.items())),
        "data_updated_min": updated_min, "data_updated_max": updated_max,
        "invalid_date_examples": date_errors,
        "sample_selection": dict(sample_buckets),
        "limits": ["Observed date minima do not prove historical completeness.",
                   "Numeric coordinates are not yet geographically validated.",
                   "No database was modified; sample rows are not representative statistics."],
    }
    report["quality_status"] = "REVIEW_REQUIRED" if not counts["rows"] or any(counts[k] for k in
        ["ragged_rows", "missing_identity", "duplicate_identity", "permitted_invalid", "closed_invalid",
         "permitted_future", "closed_future", "closed_before_permitted", "coordinate_missing", "coordinate_invalid",
         "closed_status_without_valid_date", "permitted_before_1950_review"]) or not date_fields["closed"] else "CHECKS_PASSED"
    write_json(output_dir / f"{slug}.quality.json", report)
    write_json(output_dir / f"{slug}.sample.json", samples)
    print(json.dumps({"slug": slug, "rows": counts["rows"], "regions": len(regions),
                      "dates": report["date_min"], "closed_max": report["date_max"].get("closed"),
                      "missing_coords": counts["coordinate_missing"]}, ensure_ascii=False), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--slug", choices=list(CATEGORIES) + ["all"], default="all")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data" / "national-audit")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "docs" / "data-samples" / "national")
    parser.add_argument("--download", action="store_true", help="Explicitly download missing raw files (up to 1 GiB each).")
    args = parser.parse_args()
    for slug in CATEGORIES if args.slug == "all" else [args.slug]:
        path = download(slug, args.data_dir) if args.download else args.data_dir / f"{slug}.csv"
        audit(slug, path, args.output_dir)


if __name__ == "__main__":
    main()
