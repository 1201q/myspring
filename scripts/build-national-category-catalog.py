"""Build an inventory from the official nationwide LOCALDATA public menu.

Python 3.11+; no external dependencies. Fetches HTML schemas, not business rows
or CSV dumps. Keep raw HTML/cache in ignored data/national-catalog/.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://sample.localdata.go.kr"
INDEX = BASE + "/public/beauty_salons/info"
STOP = threading.Event()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render_markdown(catalog):
    summary = catalog["summary"]
    services = catalog["services"]
    lines = ["# 전국 인허가 업종 카탈로그", "",
             f"확인 시각(UTC): {catalog['observed_at']}", "",
             f"공식 현재 메뉴의 {summary['menu_services']}개 서비스 메타데이터를 확인했다. "
             f"인허가 업종은 {summary['permit_services']}종, 기타/보조 정보는 {summary['auxiliary_or_unclassified']}종이다.", "",
             f"개·폐업 지도용 공통 필드가 있는 업종은 {summary['timeline_schema_candidates']}종이다. "
             "필드가 있다는 사실은 값의 누락률·좌표 정확도·과거 자료 완전성을 보장하지 않는다.", "",
             f"전체 CSV 다운로드와 행 검증 기록이 있는 업종은 {summary['full_files_audited']}종이다. "
             "나머지는 공식 조회 화면의 필드와 서비스 ID를 확인했으며, CSV/API 경로 템플릿을 기록했다. "
             "각 파일의 실제 다운로드 가능 여부와 인증 API는 개별 검증 전이다.", "",
             "## 사용 범위", "",
             f"- 수집 대상 카탈로그는 인허가 {summary['permit_services']}종을 모두 유지한다. 업종별 상권 분석 적합성은 별도 검토한다.",
             "- 현재 지도는 여전히 구로구 일반음식점 50건 샘플이다. 이 목록을 DB에 적재한 것은 아니다.",
             "- CCTV·공중화장실·세차장 현황 같은 보조 정보는 인허가 사건에 섞지 않는다.",
             "- 폐업일 필드가 없는 업종은 신규 인허가 분석과 폐업 분석의 지원 범위를 구분한다.",
             "- 인허가 주소가 실제 대면 영업 장소인지 확인한다. 공장·온라인 판매·본사 등록 등을 모두 점포 수로 합산하지 않는다.",
             "- `source_service_id`/`slug`는 공식 메뉴의 서비스 식별자다. 메뉴에서 확인되지 않은 숫자 업종 코드는 NULL로 남겼다.",
             "- 좌표계는 업종별 공식 카탈로그와 실제 좌표로 검증한다. 현재 3종의 카탈로그 선언만 별도로 연결했고 전체 업종에 EPSG:5174를 적용하지 않았다.", "",
             "## 출처 분류별 현황", "", "| 공식 분류 | 서비스 수 |", "| --- | ---: |"]
    lines += [f"| {group if group != 'UNGROUPED' else '별도 보조 정보'} | {count} |"
              for group, count in summary["source_group_counts"].items()]
    lines += ["", "## 폐업일 필드가 없는 인허가 업종", "",
              "다음 업종은 모두 `CLSBIZ_YMD`가 공식 조회 필드 목록에 없다. "
              "취소·말소 등 다른 날짜가 있더라도 실제 폐업과 같은 사건으로 자동 치환하지 않는다.", ""]
    lines += [f"- {r['name']} (`{r['slug']}`)" for r in services
              if r["record_kind"] == "PERMIT" and not r["capabilities"]["close_date"]]
    for group in sorted({r["source_group"] for r in services if r["record_kind"] == "PERMIT"}):
        lines += ["", f"## {group}", "", "| 업종·공식 조회 화면 | 서비스 ID | 폐업일 필드 | X/Y 필드 | 전체 CSV |",
                  "| --- | --- | --- | --- | --- |"]
        for entry in services:
            if entry["record_kind"] != "PERMIT" or entry["source_group"] != group: continue
            fields = entry["capabilities"]
            name = entry["name"].replace("|", "\\|")
            lines.append(f"| [{name}]({entry['public_page_url']}) | `{entry['slug']}` | "
                         f"{'있음' if fields['close_date'] else '없음'} | {'있음' if fields['coordinates'] else '없음'} | "
                         f"{'전량 검증 완료' if entry['csv_verification'] == 'FULL_FILE_AUDITED' else '개별 미검증'} |")
    lines += ["", "## 기타/보조 정보", ""]
    lines += [f"- [{r['name']}]({r['public_page_url']}) (`{r['slug']}`)" for r in services if r["record_kind"] != "PERMIT"]
    lines += ["", "## 파일과 재현", "",
              "- [기계용 카탈로그](data-samples/national/category-catalog.json): 서비스 ID, 분류, 공식 필드, 기능 지원 여부, 검증 단계.",
              "- [생성 스크립트](../scripts/build-national-category-catalog.py): Python 3.11 이상, 표준 라이브러리만 사용.",
              "- HTML 캐시: Git에서 제외되는 `data/national-catalog/`. 원본 HTML에는 일회성 웹 토큰이 있어 커밋하지 않는다.",
              "- [초기 3종 원본 검사](national-data-source-audit.md), [공통 수집기](national-permit-collector.md), [DB 설계안](commercial-area-timeline-data-design.md).", "",
              "```powershell", "# 받은 HTML 캐시로 카탈로그 재생성", "python scripts/build-national-category-catalog.py", "",
              "# 공식 메뉴와 메타데이터 다시 확인 (CSV 다운로드 없음)",
              "python scripts/build-national-category-catalog.py --refresh", "```", "",
              "최대 동시 2개 요청과 요청 간 대기를 사용하며, 403/429 응답 시 추가 네트워크 조회를 중단한다. "
              "실패 항목은 JSON에 기록하고 스크립트는 실패 코드로 종료한다.", "",
              "CSV 다운로드 경로와 API 기본 경로는 공식 파일/메뉴의 서비스 ID 규칙으로 구성한 후보이며, "
              "전량 검증 완료로 표시된 업종 외에는 해당 엔드포인트의 성공 응답을 확인한 것으로 취급하지 않는다. "
              "라이선스·좌표계·과거 제공 범위는 다음 개별 검증 단계에서 채운다.", ""]
    (ROOT / "docs/national-category-catalog.md").write_text("\n".join(lines), encoding="utf-8")


def fetch(url, path, refresh=False):
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8-sig")
    if STOP.is_set():
        raise RuntimeError("Stopped after provider refusal/rate limit")
    time.sleep(0.25)
    request = Request(url, headers={"Referer": INDEX, "User-Agent": "Mozilla/5.0 (PermitMap category inventory)"})
    try:
        with urlopen(request, timeout=30) as response:
            content = response.read()
        text = content.decode("utf-8-sig", errors="strict")
    except HTTPError as error:
        if error.code in (403, 429): STOP.set()
        raise
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return text


class Menu(HTMLParser):
    """Use official group containers, ignoring the duplicate /history menu."""
    def __init__(self):
        super().__init__()
        self.group_ids = {}
        self.divs = []
        self.anchor = None
        self.categories = {}
        self.history_slugs = set()

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "div":
            self.divs.append(self.group_ids.get(attrs.get("id"), self.divs[-1] if self.divs else None))
        if tag == "a":
            self.anchor = [attrs.get("href", ""), [], self.divs[-1] if self.divs else None]

    def handle_data(self, value):
        if self.anchor is not None: self.anchor[1].append(value)

    def handle_endtag(self, tag):
        if tag == "a" and self.anchor is not None:
            href, fragments, group = self.anchor
            label = " ".join("".join(fragments).split())
            if re.fullmatch(r"#public-two-0-\d+", href): self.group_ids[href[1:]] = label
            match = re.fullmatch(r"/public/([a-z0-9_]+)/info", href)
            if match:
                slug = match.group(1)
                self.categories.setdefault(slug, {"slug": slug, "name": label, "source_group": group,
                                                   "public_page_url": BASE + href})
            history = re.fullmatch(r"/public/([a-z0-9_]+)/history", href)
            if history: self.history_slugs.add(history.group(1))
            self.anchor = None
        if tag == "div" and self.divs: self.divs.pop()


def inspect(category, cache, refresh, prior, known_catalogs):
    entry = dict(category)
    slug = entry["slug"]
    known_catalog = known_catalogs.get(slug)
    entry.update({
        "source_service_id": slug,
        "source_type_code": None,
        "source_type_code_note": "Official numeric industry code not exposed in this menu; slug is a service identifier.",
        "api_base_url": f"https://apis.data.go.kr/1741000/{slug}",
        "history_public_page_url": f"{BASE}/public/{slug}/history" if entry["history_menu_listed"] else None,
        "csv_url_template": f"https://file.localdata.go.kr/file/download/{slug}/info",
        "csv_url_basis": "Official file server route confirmed for audited services; not individually probed here.",
        "csv_verification": "NOT_DOWNLOADED",
    })
    if slug in prior:
        entry["csv_verification"] = "FULL_FILE_AUDITED"
        entry["csv_audit"] = {"rows": prior[slug]["counts"]["rows"], "sha256": prior[slug]["raw_sha256"],
                              "quality_report": f"docs/data-samples/national/{slug}.quality.json"}
        entry["csv_url_basis"] = "Full official file downloaded and audited; see csv_audit."
        entry["csv_observed_historical_dates"] = prior[slug].get("date_min", {})
    try:
        text = fetch(entry["public_page_url"], cache / f"{slug}.html", refresh)
        match = re.search(r'let jsonString\s*=\s*"([^"\r\n]+)"', text)
        if not match: raise ValueError("Official schema JSON missing")
        fields = json.loads(html.unescape(match.group(1)))
        if not isinstance(fields, list) or not all(isinstance(field, dict) and "name" in field for field in fields):
            raise ValueError("Unexpected schema JSON shape")
        field_names = {field["name"] for field in fields}
        capabilities = {
            "identity": {"OPN_ATMY_GRP_CD", "MNG_NO"} <= field_names,
            "name": "BPLC_NM" in field_names,
            "permit_date": "LCPMT_YMD" in field_names,
            "close_date": "CLSBIZ_YMD" in field_names,
            "raw_status": {"SALS_STTS_CD", "SALS_STTS_NM"} <= field_names,
            "coordinates": {"CRD_INFO_X", "CRD_INFO_Y"} <= field_names,
            "address": bool({"LOTNO_ADDR", "ROAD_NM_ADDR"} & field_names),
            "source_updated_at": "LAST_MDFCN_PNT" in field_names,
        }
        is_permit = capabilities["identity"] and capabilities["permit_date"]
        entry.update({"schema_check": "OK", "schema_sha256": hashlib.sha256(
            json.dumps(fields, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
            "field_count": len(fields),
            "fields": [{"name": field["name"], "label": field.get("koreanName")} for field in fields],
            "capabilities": capabilities,
            "record_kind": "PERMIT" if is_permit else "AUXILIARY_OR_UNCLASSIFIED",
            "timeline_schema_candidate": is_permit and all(capabilities.values()),
            "api_url_basis": "Derived from official menu service slug; authenticated API not called.",
            "crs": None, "crs_check": "NEEDS_CATALOG_AND_COORDINATE_VALIDATION",
            "history_check": "MENU_LINK_ONLY" if entry["history_menu_listed"] else "NOT_LISTED",
            "historical_coverage": "NOT_VERIFIED",
            "selection": "REVIEW_REQUIRED",
            "selection_note": "Schema compatibility does not establish that the registered address represents a customer-facing shop.",
        })
        if known_catalog:
            entry.update({"official_catalog_url": known_catalog["catalog_url"],
                          "catalog_license": known_catalog["license"],
                          "api_base_url": known_catalog["api_base"],
                          "api_url_basis": "Official catalog metadata confirmed; authenticated API not called.",
                          "declared_crs": (re.search(r"EPSG:\s*\d+", known_catalog["description"]).group(0)
                                           if re.search(r"EPSG:\s*\d+", known_catalog["description"]) else None),
                          "crs_check": "CATALOG_DECLARATION_ONLY; full nationwide geographic validation pending",
                          "history_check": "CATALOG_DESCRIPTION_ONLY; authenticated API not called",
                          "history_description": known_catalog["operations"]["/history"],
                          "historical_coverage": "See full CSV quality report; observed date range is not proof of completeness."})
    except Exception as error:
        entry.update({"schema_check": "FAILED", "error": f"{type(error).__name__}: {error}",
                      "record_kind": "UNCLASSIFIED", "timeline_schema_candidate": False})
    return entry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Re-fetch metadata pages (no CSV downloads).")
    args = parser.parse_args()
    cache = ROOT / "data" / "national-catalog"
    text = fetch(INDEX, cache / "index.html", args.refresh)
    menu = Menu(); menu.feed(text)
    if not menu.categories: raise ValueError("Official menu has no recognized services")
    for slug, category in menu.categories.items():
        category["history_menu_listed"] = slug in menu.history_slugs
    prior = {r["slug"]: r for path in (ROOT / "docs/data-samples/national").glob("*.quality.json")
             for r in [json.loads(path.read_text(encoding="utf-8"))]}
    known_path = ROOT / "docs/data-samples/national/catalogs.json"
    known_catalogs = {r["slug"]: r for r in json.loads(known_path.read_text(encoding="utf-8"))} if known_path.exists() else {}
    results = []
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(inspect, c, cache, args.refresh, prior, known_catalogs) for c in menu.categories.values()]
        for future in as_completed(futures):
            results.append(future.result())
            if len(results) % 20 == 0 or len(results) == len(futures):
                print(f"Inspected {len(results)}/{len(futures)} metadata pages", flush=True)
    results.sort(key=lambda r: ((r["source_group"] or ""), r["name"]))
    summary = {
        "menu_services": len(results), "schema_ok": sum(r["schema_check"] == "OK" for r in results),
        "schema_failed": sum(r["schema_check"] != "OK" for r in results),
        "permit_services": sum(r["record_kind"] == "PERMIT" for r in results),
        "auxiliary_or_unclassified": sum(r["record_kind"] != "PERMIT" for r in results),
        "timeline_schema_candidates": sum(r["timeline_schema_candidate"] for r in results),
        "history_menu_listed": sum(r["history_menu_listed"] for r in results),
        "full_files_audited": sum(r["csv_verification"] == "FULL_FILE_AUDITED" for r in results),
        "source_group_counts": dict(Counter(r["source_group"] or "UNGROUPED" for r in results)),
    }
    catalog = {"observed_at": datetime.now(timezone.utc).isoformat(), "source_menu": INDEX,
               "menu_text_sha256": hashlib.sha256(text.encode()).hexdigest(),
               "scope": "Services present in the official public menu; not proof of every dataset ever published.",
               "summary": summary, "services": results}
    save(ROOT / "docs/data-samples/national/category-catalog.json", catalog)
    render_markdown(catalog)
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    if summary["schema_failed"]:
        raise SystemExit("Catalog saved with failed metadata checks; inspect failures before use.")


if __name__ == "__main__": main()
