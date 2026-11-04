"""Meaningful ingest-boundary tests; run with unittest discovery."""
import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]


def module(filename, name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


audit = module("audit-national-permits.py", "audit")
collector = module("collect-national-permits.py", "collector")
CATALOG = json.loads(collector.DEFAULT_CATALOG.read_text(encoding="utf-8"))


class CollectorTests(unittest.TestCase):
    def setUp(self):
        test_root = (SCRIPTS.parent / "data/collector-tests").resolve()
        test_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=test_root)
        # Cleanup can only remove this test's freshly created workspace directory.
        assert Path(self.temp.name).resolve().is_relative_to(test_root)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.category = next(entry for entry in CATALOG["services"] if entry["slug"] == "pharmacies")

    def write_rows(self, rows, *, category=None):
        category = category or self.category
        names = {field["name"]: field["label"] for field in category["fields"]}
        labels = [names[code] for code in audit.API_FIELDS if code in names]
        path = self.root / "input.csv"
        with path.open("w", encoding="cp949", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=labels)
            writer.writeheader()
            for values in rows:
                row = {key: "" for key in labels}
                row.update({"개방자치단체코드": "3000000", "관리번호": "shared-id", "사업장명": "테스트 약국",
                            "인허가일자": "2020-01-01", "영업상태코드": "01", "영업상태명": "영업/정상",
                            "좌표정보(X)": "200000", "좌표정보(Y)": "450000"})
                row.update(values)
                writer.writerow(row)
        return path

    def run_audit(self, path, category=None):
        category = category or self.category
        with redirect_stdout(io.StringIO()):
            return audit.audit(category["slug"], path, self.root / "reports", category=category)

    def test_same_management_number_in_different_municipalities_is_not_same_permit(self):
        path = self.write_rows([{}, {"개방자치단체코드": "3010000"}, {}])
        report = self.run_audit(path)
        self.assertEqual(report["counts"]["duplicate_management_number"], 2)
        self.assertEqual(report["counts"]["duplicate_identity"], 1)
        self.assertEqual(report["quality_status"], "REVIEW_REQUIRED")

    def test_invalid_and_future_dates_remain_quality_issues_not_invented_events(self):
        path = self.write_rows([{"인허가일자": "20230229", "폐업일자": "9999-12-31"}])
        report = self.run_audit(path)
        self.assertEqual(report["counts"]["permitted_invalid"], 1)
        self.assertEqual(report["counts"]["closed_future"], 1)
        self.assertEqual(report["permitted_by_year"], {})
        self.assertEqual(report["quality_status"], "REVIEW_REQUIRED")

    def test_unprovided_close_date_is_not_counted_as_missing_on_every_row(self):
        category = next(e for e in CATALOG["services"] if e["slug"] == "lumber_import_distribution")
        report = self.run_audit(self.write_rows([{}], category=category), category)
        self.assertFalse(report["date_field_support"]["closed"])
        self.assertNotIn("closed_missing", report["counts"])
        self.assertEqual(report["closed_by_year"], {})

    def test_truncated_download_is_not_published_as_completed_csv(self):
        validation = io.BytesIO(b"{}")
        response = io.BytesIO(b"a,b\n1,2\n")
        response.headers = {"Content-Type": "text/csv", "Content-Length": "100"}
        with patch.object(audit, "request", side_effect=[validation, response]):
            with self.assertRaisesRegex(ValueError, "Content-Length"):
                audit.download("pharmacies", self.root)
        self.assertFalse((self.root / "pharmacies.csv").exists())
        self.assertFalse((self.root / "pharmacies.download.json").exists())

    def test_html_error_document_is_not_accepted_as_csv(self):
        response = io.BytesIO(b"<html>error</html>")
        response.headers = {"Content-Type": "text/html"}
        with patch.object(audit, "request", side_effect=[io.BytesIO(b"{}"), response]):
            with self.assertRaisesRegex(ValueError, "error document"):
                audit.download("pharmacies", self.root)
        self.assertFalse((self.root / "pharmacies.csv").exists())

    def test_tampered_cached_file_is_rejected_before_report_is_written(self):
        path = self.write_rows([{}])
        raw = path.read_bytes()
        path.with_suffix(".download.json").write_text(json.dumps({"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}), encoding="utf-8")
        path.write_bytes(raw.replace(b"2020-01-01", b"2021-01-01"))
        with self.assertRaisesRegex(ValueError, "hash differs"):
            self.run_audit(path)
        self.assertFalse((self.root / "reports/pharmacies.quality.json").exists())

    def test_auxiliary_data_cannot_be_selected_as_permit_category(self):
        with self.assertRaisesRegex(ValueError, "non-permit"):
            collector.select_categories(CATALOG["services"], ["cctv_info"], [])

    def test_missing_provenance_is_recorded_as_failed_run_without_touching_csv(self):
        path = self.write_rows([{}]).rename(self.root / "pharmacies.csv")
        before = path.read_bytes()
        catalog = self.root / "catalog.json"
        catalog.write_text(json.dumps({"observed_at": "2026-11-04T00:00:00Z", "services": [self.category]}), encoding="utf-8")
        with patch.object(collector, "ROOT", self.root), patch.object(collector, "load_auditor", return_value=audit), redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            result = collector.main(["--catalog", str(catalog), "--slug", "pharmacies", "--data-dir", str(self.root)])
        self.assertEqual(result, 1)
        manifest = json.loads(next((self.root / "data/national-collection/runs").glob("*.json")).read_text(encoding="utf-8"))
        self.assertEqual(manifest["status"], "FAILED")
        self.assertIn("no download provenance", manifest["categories"][0]["error"])
        self.assertEqual(path.read_bytes(), before)

    def test_dry_run_never_downloads_or_creates_run_files(self):
        catalog = self.root / "catalog.json"
        catalog.write_text(json.dumps({"observed_at": "2026-11-04T00:00:00Z", "services": [self.category]}), encoding="utf-8")
        with patch.object(collector, "ROOT", self.root), patch.object(collector, "load_auditor") as loader, redirect_stdout(io.StringIO()):
            result = collector.main(["--catalog", str(catalog), "--category", self.category["name"], "--download", "--dry-run"])
        self.assertEqual(result, 0)
        loader.assert_not_called()
        self.assertFalse((self.root / "data/national-collection").exists())


if __name__ == "__main__": unittest.main()
