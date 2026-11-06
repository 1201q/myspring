"""Inventory public preview counts only; never download full files or access DBs."""
import concurrent.futures
import datetime as dt
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs/data-samples/national/category-volume-inventory.json'


def probe(entry):
    slug = entry['slug']
    url = f'https://sample.localdata.go.kr/public/call/{slug}/info?pageNo=1&numOfRows=10'
    result = {key: entry[key] for key in ('slug', 'name', 'source_group')}
    result.update(preview_url=url, csv_url=entry['csv_url_template'],
                  csv_availability='NOT_PROBED', close_date_supported=entry['capabilities']['close_date'])
    request = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (PermitMap category inventory)',
        'Referer': entry['public_page_url']})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read(2 * 1024 * 1024))
        count = payload['response']['body']['totalCount']
        if isinstance(count, bool) or not str(count).isdigit():
            raise ValueError('Invalid totalCount')
        result.update(status='OK', total_count=int(count))
    except urllib.error.HTTPError as error:
        result.update(status='FAILED', error=f'HTTP {error.code}')
    except (OSError, ValueError, KeyError, TypeError) as error:
        result.update(status='FAILED', error=type(error).__name__)
    result['observed_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
    time.sleep(0.25)
    return result


def main():
    catalog = json.loads((ROOT / 'docs/data-samples/national/category-catalog.json').read_text(encoding='utf-8-sig'))
    entries = [e for e in catalog['services'] if e['record_kind'] == 'PERMIT']
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(probe, entries):
            results.append(result)
            report = {
                'observed_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                'scope': 'One public preview per permit category; no pagination, full CSV downloads, or DB access.',
                'expected_categories': len(entries), 'checked_categories': len(results),
                'successful_categories': sum(r['status'] == 'OK' for r in results),
                'known_total_rows': sum(r.get('total_count', 0) for r in results),
                'categories': results}
            temporary = OUTPUT.with_suffix('.json.tmp')
            temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            temporary.replace(OUTPUT)
            print(f"{len(results)}/{len(entries)} {result['slug']} {result['status']} {result.get('total_count', '')}", flush=True)


if __name__ == '__main__':
    main()
