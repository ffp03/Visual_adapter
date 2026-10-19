"""Summarize retained artifacts, including incomplete benchmark runs, without any network use."""
import csv
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'workspace/task023'


def load(name, default):
    file = OUT / name
    return json.loads(file.read_text(encoding='utf-8')) if file.exists() else default


corpus = load('corpus.json', {'pages': [], 'decode_failures': []})
public = load('public-fetches.json', {'attempts': [], 'pairs': []})
summary = {'generated_utc': datetime.now(timezone.utc).isoformat(),
           'source_commit': '0b5594e13c6c0eb038a44e3138f7575a4ebc25b2',
           'historical_captures_decoded': len(corpus['pages']),
           'historical_hostnames': len({r['hostname'] for r in corpus['pages']}),
           'decode_failures': corpus['decode_failures'],
           'fetch_attempts': len(public['attempts']),
           'successful_html_fetches': sum(r['success'] for r in public['attempts']),
           'fetch_failures': [r for r in public['attempts'] if not r['success']],
           'candidate_public_pairs': len(public['pairs']),
           'actual_provider_calls': {'generation': 0, 'refresh': 0, 'retry': 0, 'failed': 0},
           'fresh_ai_quality': 'unavailable: not authorized; no provider receipts',
           'benchmarks': {}, 'source_hashes': {}}
all_rows = []
for tag in ['baseline', 'repaired', 'public']:
    benchmark = load(f'{tag}-benchmark.json', {'results': []})
    rows = benchmark['results']
    measured = [r for r in rows if r.get('available')]
    summary['benchmarks'][tag] = {
        'pages_with_any_result': len({r['id'] for r in rows}),
        'pages_measured': len({r['id'] for r in measured}),
        'measured_rows': len(measured),
        'by_approach': {a: dict(Counter(r.get('content_outcome', 'unavailable') for r in measured if r['approach'] == a))
                        for a in ['fresh-per-page-ai', 'shared-reusable-rules', 'general-local-fallback']},
        'unavailable_rows': len([r for r in rows if not r.get('available')]),
        'environment': benchmark.get('environment'),
    }
    for row in rows:
        all_rows.append({'run': tag, **row})
    # Also produce a CSV when a benchmark was intentionally stopped between pages.
    if rows:
        columns = ['id', 'approach', 'available', 'content_outcome', 'reference_anchors', 'retained_anchors',
                   'used_rule', 'rule_failure', 'median_local_delay_ms', 'production_dom_score', 'reason', 'error']
        with (OUT / f'{tag}-benchmark.csv').open('w', newline='', encoding='utf-8') as handle:
            writer = csv.DictWriter(handle, fieldnames=columns, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(rows)

refs = {r['id']: r for r in load('public-references.json', [])}
measured_public = {r['id'] for r in all_rows if r['run'] == 'public' and r.get('available') and r['approach'] == 'general-local-fallback'}
summary['public_measured_hostnames'] = sorted({r['site'] for r in public['attempts'] if r['id'] in measured_public})
summary['public_measured_sites'] = len(summary['public_measured_hostnames'])
summary['public_sites_with_two_measured_pages'] = sum(all(page in measured_public for page in pair['pages']) for pair in public['pairs'])
pair_rows = []
for pair in public['pairs']:
    labels = [refs.get(page) for page in pair['pages']]
    exclusions = []
    if not all(page in measured_public for page in pair['pages']):
        exclusions.append('benchmark incomplete')
    if not all(label and label['anchors'] for label in labels):
        exclusions.append('missing provisional reference anchors')
    elif labels[0]['anchors'] == labels[1]['anchors']:
        exclusions.append('identical provisional reference anchors; distinct content unproven')
    pair_rows.append({**pair, 'provisional_pair_evidence_complete': not exclusions,
                      'exclusions': exclusions, 'parent_reference_review': 'pending'})
summary['paired_page_evidence'] = pair_rows
summary['provisional_pairs_with_both_pages_measured'] = sum(r['provisional_pair_evidence_complete'] for r in pair_rows)
summary['provisional_paired_pages'] = 2 * summary['provisional_pairs_with_both_pages_measured']
summary['historical_vs_public'] = 'Historical 2025 captures are a separate unpaired corpus; public pair members fetched together in 2026. No cross-year pair claims.'
summary['public_decoding_limit'] = 'Initial public batch used UTF-8 replacement decoding when no HTTP charset was given. Replacement characters may exist; original response bytes were not retained. Future collector now uses strict header/meta charset decoding and preserves response bytes. Batch was not retried.'
summary['public_pages_with_replacement_characters'] = sum('\ufffd' in (ROOT / r['html_file']).read_text(encoding='utf-8') for r in public['attempts'] if r['success'])
summary['bounded_benchmark'] = load('bounded-benchmark-events.json', {})
public_outcomes = {r['id']: r for r in all_rows if r['run'] == 'public' and r['approach'] == 'general-local-fallback'}
event_by_id = {e['id']: e for e in summary['bounded_benchmark'].get('events', [])}
coverage = []
for attempt in public['attempts']:
    outcome = public_outcomes.get(attempt['id'], {})
    event = event_by_id.get(attempt['id'], {})
    coverage.append({'id': attempt['id'], 'site': attempt['site'], 'url': attempt['url'],
                     'fetch_success': attempt['success'], 'http_status': attempt.get('status', ''),
                     'measurement_status': 'measured' if outcome.get('available') else ('failed' if outcome.get('error') else (event.get('status') or ('not-yet-measured' if attempt['success'] else 'fetch-failed'))),
                     'content_outcome': outcome.get('content_outcome', ''),
                     'reference_anchors': outcome.get('reference_anchors', ''), 'retained_anchors': outcome.get('retained_anchors', ''),
                     'median_local_delay_ms': outcome.get('median_local_delay_ms', ''),
                     'generation_calls_actual': 0, 'refresh_calls_actual': 0, 'retry_calls_actual': 0,
                     'error': outcome.get('error') or event.get('error') or attempt.get('error', ''),
                     'parent_reference_review': 'pending'})
if coverage:
    with (OUT / 'public-page-coverage.csv').open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(coverage[0]))
        writer.writeheader()
        writer.writerows(coverage)
for file in [ROOT / p for p in ['extension/content.js', 'extension/background.js', 'extension/sidepanel.js', 'backend/index.js', 'tests/test_data/good_rules.json', 'package.json', '.gitignore']] + list((ROOT / 'tests/local').glob('*')) + list((OUT / 'archive').glob('*')):
    if file.is_file():
        summary['source_hashes'][str(file.relative_to(ROOT))] = hashlib.sha256(file.read_bytes()).hexdigest()
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
report = OUT / 'worker-report.md'
if report.exists():
    marker = '<!-- GENERATED_MEASUREMENT_STATUS -->'
    text = report.read_text(encoding='utf-8').split(marker)[0].rstrip()
    public_stats = summary['benchmarks']['public']
    events = summary.get('bounded_benchmark', {}).get('events', [])
    statuses = dict(Counter(e['status'] for e in events))
    pair_sites = [r['site'] for r in pair_rows if r['provisional_pair_evidence_complete']]
    text += '\n\n' + marker + '\n## Latest exact measurement status\n\n'
    text += f"As of {summary['generated_utc']}: **{public_stats['pages_measured']} public pages measured across {summary['public_measured_sites']} sites; {summary['provisional_pairs_with_both_pages_measured']} provisional pairs / {summary['provisional_paired_pages']} paired pages** with both measurements and nonempty distinct reference anchors. {summary['public_sites_with_two_measured_pages']} sites have two measured pages before reference exclusions. Parent inspection remains pending. These are a subset of 48 retained fetched pages and 23 two-URL candidate pairs; the target was not completed.\n\n"
    text += f"Public local-fallback outcomes: `{json.dumps(public_stats['by_approach']['general-local-fallback'])}`. Shared-fixture rows: `{json.dumps(public_stats['by_approach']['shared-reusable-rules'])}`. Fresh AI: unavailable.\n\n"
    text += f"Sequential supervisor statuses: `{json.dumps(statuses)}`; these exclude pages already measured before the supervisor. Exact timeout IDs are in `bounded-benchmark-events.json`.\n\n"
    text += 'Sites meeting the provisional pair condition: ' + (', '.join(pair_sites) or 'none') + '.\n\n'
    text += 'All 58 historical captures decoded (55 contain multiple HTML parts), across nine categories. Six historical pages have both baseline and repaired measurements. All 58 root selections matched the snapshot Content-Location.\n'
    report.write_text(text, encoding='utf-8')
print(json.dumps({k: summary[k] for k in ['historical_captures_decoded', 'fetch_attempts', 'successful_html_fetches', 'candidate_public_pairs', 'provisional_pairs_with_both_pages_measured', 'provisional_paired_pages', 'public_pages_with_replacement_characters']}, indent=2))
print(json.dumps({tag: {k: v for k, v in data.items() if k != 'environment'} for tag, data in summary['benchmarks'].items()}, indent=2))
