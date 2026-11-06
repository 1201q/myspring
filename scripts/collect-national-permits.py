"""Select nationwide permit categories from the official catalog and audit CSVs.

Python 3.11+, standard library only; no database changes.
Examples:
  python scripts/collect-national-permits.py --list --group 생활
  python scripts/collect-national-permits.py --category 약국 --dry-run
  python scripts/collect-national-permits.py --slug pharmacies --download
"""
import argparse
import datetime as dt
import importlib.util
import json
from pathlib import Path
import re
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "docs/data-samples/national/category-catalog.json"
PROFILES = ROOT / "config/collection-profiles.json"


def profile_slugs(name):
    profiles = json.loads(PROFILES.read_text(encoding="utf-8-sig"))
    if name not in profiles:
        raise ValueError(f"Unknown collection profile: {name}")
    slugs = profiles[name]["slugs"]
    if not isinstance(slugs, list) or not slugs or not all(isinstance(s, str) for s in slugs):
        raise ValueError("Collection profile must contain service IDs")
    if len(slugs) != len(set(slugs)):
        raise ValueError("Collection profile contains duplicate service IDs")
    return slugs


def load_auditor():
    spec = importlib.util.spec_from_file_location("national_auditor", Path(__file__).with_name("audit-national-permits.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_categories(path):
    catalog = json.loads(path.read_text(encoding="utf-8-sig"))
    services = catalog["services"]
    slugs = [entry["slug"] for entry in services]
    if len(slugs) != len(set(slugs)):
        raise ValueError("Catalog contains duplicate service IDs")
    for entry in services:
        if not re.fullmatch(r"[a-z0-9_]+", entry["slug"]):
            raise ValueError("Catalog contains an unsafe service ID")
    return catalog, services


def select_categories(services, slugs, names, group=None):
    permits = [entry for entry in services if entry["record_kind"] == "PERMIT"]
    for slug in slugs:
        if not any(entry["slug"] == slug for entry in permits):
            raise ValueError(f"Unknown or non-permit service: {slug}")
    for name in names:
        matches = [entry for entry in permits if entry["name"] == name]
        if len(matches) != 1:
            raise ValueError(f"Category name must match exactly one permit service: {name}")
    if group and not any(entry["source_group"] == group for entry in permits):
        raise ValueError(f"Unknown permit group: {group}")
    return [entry for entry in permits if
            (not slugs and not names or entry["slug"] in slugs or entry["name"] in names)
            and (not group or entry["source_group"] == group)]


def validate_contract(entry):
    if entry.get("schema_check") != "OK" or not entry.get("capabilities", {}).get("identity"):
        raise ValueError("Category schema/identity has not been verified")
    names = {field["name"] for field in entry["fields"]}
    if not {"OPN_ATMY_GRP_CD", "MNG_NO", "BPLC_NM", "LCPMT_YMD"} <= names:
        raise ValueError("Category does not support the common permit contract")
    expected = f"https://file.localdata.go.kr/file/download/{entry['slug']}/info"
    if entry.get("csv_url_template") != expected:
        raise ValueError("CSV route differs from the verified official route pattern; review required")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--profile", help="Named collection selection from config/collection-profiles.json.")
    parser.add_argument("--slug", action="append", default=[], help="Official service ID; repeat to select multiple categories.")
    parser.add_argument("--category", action="append", default=[], help="Exact Korean category name; repeat if needed.")
    parser.add_argument("--group", help="Filter a list or selection by official group name.")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without downloading or writing files.")
    parser.add_argument("--download", action="store_true", help="Download missing files only; never overwrite completed CSVs.")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data/national-audit")
    parser.add_argument("--output-dir", type=Path, help="Default: ignored per-run report directory.")
    args = parser.parse_args(argv)
    try:
        catalog, services = read_categories(args.catalog)
        if args.profile and (args.slug or args.category):
            raise ValueError("Use --profile separately from --slug/--category to keep its scope explicit")
        slugs = profile_slugs(args.profile) if args.profile else args.slug
        selected = select_categories(services, slugs, args.category, args.group)
        if not args.list and not slugs and not args.category:
            parser.error("Select categories with --slug or --category; use --list to browse all permits.")
        if not selected:
            raise ValueError("No category matches this selection/group")
        for entry in selected: validate_contract(entry)
    except (ValueError, KeyError) as error:
        parser.error(str(error))
    if args.list or args.dry_run:
        print(json.dumps({"count": len(selected), "download_requested": args.download,
                          "categories": [{"slug": e["slug"], "name": e["name"], "group": e["source_group"],
                                          "close_date_supported": e["capabilities"]["close_date"],
                                          "local_csv_exists": (args.data_dir / f"{e['slug']}.csv").exists()}
                                         for e in selected]}, ensure_ascii=False, indent=2))
        return 0

    auditor = load_auditor()
    now = dt.datetime.now(dt.timezone.utc)
    run_id = now.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    run_dir = ROOT / "data/national-collection/runs"
    manifest_path = run_dir / f"{run_id}.json"
    output = args.output_dir or ROOT / "data/national-collection/reports" / run_id
    manifest = {"run_id": run_id, "started_at": now.isoformat(), "status": "RUNNING",
                "catalog_observed_at": catalog["observed_at"],
                "catalog_path": str(args.catalog.resolve()), "output_dir": str(output.resolve()),
                "download_requested": args.download, "selected_slugs": [e["slug"] for e in selected],
                "collection_profile": args.profile,
                "categories": []}
    auditor.write_json(manifest_path, manifest)
    print(f"Run manifest: {manifest_path}", flush=True)
    try:
        for entry in selected:
            slug = entry["slug"]
            job = {"slug": slug, "name": entry["name"], "status": "RUNNING"}
            manifest["categories"].append(job)
            auditor.write_json(manifest_path, manifest)
            path = args.data_dir / f"{slug}.csv"
            existed = path.exists()
            if not existed and not args.download:
                raise FileNotFoundError(f"Missing {path}; add --download to fetch it")
            if args.download: path = auditor.download(slug, args.data_dir)
            provenance_path = path.with_suffix(".download.json")
            if not provenance_path.exists():
                raise ValueError("CSV has no download provenance; inspect its source before collection")
            provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
            if provenance.get("url") != entry["csv_url_template"]:
                raise ValueError("CSV provenance URL does not match selected category")
            # Earlier audited files predate per-download hashes; check the recorded baseline too.
            baseline = entry.get("csv_audit", {}).get("sha256")
            report = auditor.audit(slug, path, output, category=entry,
                                   expected_sha256=baseline if not provenance.get("sha256") else None)
            job.update({"status": "COMPLETED", "file_action": "REUSED" if existed else "DOWNLOADED",
                        "rows": report["counts"]["rows"], "sha256": report["raw_sha256"],
                        "quality_status": report["quality_status"], "close_date_supported": report["date_field_support"]["closed"],
                        "quality_report": str((output / f"{slug}.quality.json").resolve())})
            auditor.write_json(manifest_path, manifest)
        manifest["status"] = "COMPLETED"
    except (Exception, KeyboardInterrupt) as error:
        manifest["status"] = "INTERRUPTED" if isinstance(error, KeyboardInterrupt) else "FAILED"
        if manifest["categories"]:
            manifest["categories"][-1].update({"status": manifest["status"], "error": f"{type(error).__name__}: {error}"})
        print(f"Collection failed: {error}", file=sys.stderr)
    finally:
        manifest["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        auditor.write_json(manifest_path, manifest)
    print(f"{manifest['status']}: {len(manifest['categories'])}/{len(selected)} categories processed", flush=True)
    return 0 if manifest["status"] == "COMPLETED" else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
