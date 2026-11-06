"""Export a compact collection proof without business records or credentials."""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    if manifest['status'] != 'COMPLETED':
        raise ValueError('Only completed collection runs can be exported')
    categories = []
    for job in manifest['categories']:
        report = json.loads(Path(job['quality_report']).read_text(encoding='utf-8'))
        categories.append({
            'slug': job['slug'], 'name': job['name'], 'file_action': job['file_action'],
            'rows': report['counts']['rows'], 'raw_bytes': report['raw_bytes'],
            'sha256': report['raw_sha256'], 'source_page': report['source_page'],
            'downloaded_at': report['download']['downloaded_at'],
            'audited_at': report['audited_at'], 'quality_as_of_date': report['quality_as_of_date'],
            'quality_status': report['quality_status'], 'counts': report['counts'],
            'date_field_support': report['date_field_support']})
    result = {
        'run_id': manifest['run_id'], 'profile': manifest.get('collection_profile'),
        'status': manifest['status'], 'started_at': manifest['started_at'],
        'finished_at': manifest['finished_at'], 'category_count': len(categories),
        'rows': sum(c['rows'] for c in categories),
        'raw_bytes': sum(c['raw_bytes'] for c in categories),
        'database_modified': False,
        'scope': 'Local CSV acquisition and audit only; mixed download dates; not proof of geographic or historical completeness.',
        'categories': categories}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'categories'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
