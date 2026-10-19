"""Bound local page processes; exclusions are not successful measurements."""
import argparse
import json
import re
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'workspace/task023'


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--seconds', type=int, default=480)
    parser.add_argument('--per-page', type=int, default=30)
    parser.add_argument('--tag', default='public')
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[A-Za-z0-9_-]+', args.tag):
        parser.error('tag must contain only letters, digits, hyphens or underscores')
    fetches = json.loads((OUT / 'public-fetches.json').read_text(encoding='utf-8'))
    result_file = OUT / (args.tag + '-benchmark.json')
    event_file = OUT / ('bounded-benchmark-events.json' if args.tag == 'public' else args.tag + '-bounded-benchmark-events.json')
    rows = [row for row in fetches['attempts'] if row['success']]
    start = time.monotonic()
    events = []
    for row in rows:
        benchmark = json.loads(result_file.read_text(encoding='utf-8')) if result_file.exists() else {'results': []}
        if any(result['id'] == row['id'] and result.get('available') for result in benchmark['results']):
            continue
        remaining = args.seconds - (time.monotonic() - start)
        if remaining < 5:
            break
        duration = min(args.per_page, remaining)
        command = ['node', '--expose-gc', 'tests/local/benchmark.cjs', '--public', '--resume', '--skip-score', '--tag=' + args.tag, '--page-id=' + row['id']]
        event = {'id': row['id'], 'command': command, 'timeout_seconds': duration}
        try:
            completed = subprocess.run(command, cwd=ROOT, timeout=duration, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
            event.update(status='finished' if completed.returncode == 0 else 'failed', returncode=completed.returncode)
            if completed.returncode:
                event['error'] = completed.stderr[-500:]
        except subprocess.TimeoutExpired:
            event.update(status='timeout', error='Local benchmark exceeded per-page process bound; not a measured content outcome or delay')
        events.append(event)
        event_file.write_text(json.dumps({'total_bound_seconds': args.seconds, 'per_page_bound_seconds': args.per_page, 'events': events}, indent=2), encoding='utf-8')
        print(row['id'], event['status'], flush=True)
    print(json.dumps({'elapsed_seconds': time.monotonic() - start, 'attempted_pages': len(events)}))


if __name__ == '__main__':
    main()
