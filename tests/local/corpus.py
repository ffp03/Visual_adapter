"""Standard-library MHTML decoding and bounded public paired-page collection.
Run with the project's .venv/Scripts/python.exe. No provider or credential access.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'workspace/task023'


def decode_mhtml(data):
    msg = BytesParser(policy=policy.default).parsebytes(data)
    parts = [p for p in msg.walk() if p.get_content_type() == 'text/html' and not p.is_multipart()]
    if not parts:
        raise ValueError('No HTML MIME part')
    start = (msg.get_param('start') or '').strip('<>')
    location = msg.get('Snapshot-Content-Location') or msg.get('Content-Location')
    selected = next((p for p in parts if start and (p.get('Content-ID') or '').strip('<>') == start), None)
    reason = 'multipart start Content-ID'
    if selected is None:
        selected = next((p for p in parts if location and p.get('Content-Location') == location), None)
        reason = 'snapshot Content-Location'
    if selected is None:
        # RFC multipart/related default root is its first body part, not an arbitrary later HTML frame.
        first = next(msg.iter_parts(), None) if msg.is_multipart() else msg
        if first is None or first.get_content_type() != 'text/html':
            raise ValueError('Ambiguous MIME root: no start/snapshot match and first part is not HTML')
        selected, reason = first, 'first MIME root part'
    payload = selected.get_payload(decode=True)
    charset = selected.get_content_charset()
    if not charset:
        match = re.search(br'charset\s*=\s*[\"\x27]?([\w-]+)', payload[:8192], re.I)
        charset = match.group(1).decode('ascii') if match else 'utf-8'
    html = payload.decode(charset, errors='strict')
    return html, {'url': selected.get('Content-Location') or location, 'capture_date': msg.get('Date'),
                  'html_parts': len(parts), 'root_selection': reason, 'charset': charset}


def decode_all():
    dest = OUT / 'decoded'
    dest.mkdir(parents=True, exist_ok=True)
    rows, failures = [], []
    for i, file in enumerate(sorted((ROOT / 'tests/samples').rglob('*.mhtml'))):
        try:
            data = file.read_bytes()
            html, meta = decode_mhtml(data)
            target = dest / f'capture-{i:03d}.html'
            target.write_text(html, encoding='utf-8')
            rows.append(dict(id=f'capture-{i:03d}', kind='historical-capture', source=str(file.relative_to(ROOT)),
                             html_file=str(target.relative_to(ROOT)), source_sha256=hashlib.sha256(data).hexdigest(),
                             hostname=urlsplit(meta['url']).hostname, category=file.parent.name, **meta))
        except Exception as exc:
            failures.append({'source': str(file.relative_to(ROOT)), 'error': str(exc)})
    result = {'pages': rows, 'decode_failures': failures}
    (OUT / 'corpus.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'decoded': len(rows), 'hostnames': len({r['hostname'] for r in rows}), 'failures': failures}))


def fetch_pairs(limit):
    """Two distinct contemporaneous public URLs: capture URL and hostname root.
    One request per URL, max 3 workers, 12s timeout, 3MB response cap; no retries.
    Redirects to login and HTTP failures are excluded, never bypassed.
    """
    corpus = json.loads((OUT / 'corpus.json').read_text(encoding='utf-8'))
    candidates = []
    for row in corpus['pages']:
        url = urlsplit(row['url'])
        first = urlunsplit((url.scheme, url.netloc, url.path or '/', url.query, ''))
        second = urlunsplit((url.scheme, url.netloc, '/', '', ''))
        if first != second and url.scheme in ('http', 'https'):
            candidates.append((row, [first, second]))
        if len(candidates) == limit:
            break
    dest = OUT / 'public'
    dest.mkdir(exist_ok=True)

    def one(task):
        row, index, url = task
        result = {'site': row['hostname'], 'url': url, 'id': f'public-{row["id"]}-{index}',
                  'category': row['category'], 'kind': 'public-fetch', 'fetched_utc': datetime.now(timezone.utc).isoformat()}
        try:
            request = Request(url, headers={'User-Agent': 'VisualAdapter-LocalResearch/1.0', 'Accept': 'text/html'})
            with urlopen(request, timeout=12) as response:
                result['status'] = response.status
                result['final_url'] = response.url
                if response.headers.get_content_type() != 'text/html':
                    raise ValueError('Not HTML')
                if re.search(r'/(login|signin|sign-in|challenge)(/|\?|$)', urlsplit(response.url).path, re.I):
                    raise ValueError('Login/challenge redirect excluded')
                data = response.read(3_000_001)
                if len(data) > 3_000_000:
                    raise ValueError('Response exceeds 3MB cap')
                charset = response.headers.get_content_charset()
                if not charset:
                    match = re.search(br'charset\s*=\s*[\"\x27]?([\w-]+)', data[:8192], re.I)
                    charset = match.group(1).decode('ascii') if match else 'utf-8'
                html = data.decode(charset, errors='strict')
                if re.search(r'<title[^>]*>\s*(access denied|just a moment|attention required|robot)', html, re.I):
                    raise ValueError('Access/bot control page excluded')
                target = dest / (result['id'] + '.html')
                target.write_text(html, encoding='utf-8')
                raw_target = dest / (result['id'] + '.response.bin')
                raw_target.write_bytes(data)
                result.update(html_file=str(target.relative_to(ROOT)), raw_file=str(raw_target.relative_to(ROOT)), charset=charset,
                              sha256=hashlib.sha256(data).hexdigest(), success=True)
        except Exception as exc:
            result.update(success=False, error=str(exc))
        return result

    tasks = [(row, index, url) for row, urls in candidates for index, url in enumerate(urls)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(one, tasks))
    pairs = []
    for row, urls in candidates:
        pages = [r for r in results if r['site'] == row['hostname'] and r['success']]
        final_urls = {r.get('final_url', '').rstrip('/') for r in pages}
        if len(pages) == 2 and len(final_urls) == 2:
            pairs.append({'site': row['hostname'], 'pages': [p['id'] for p in pages], 'pair_type': 'contemporaneous-public-fetches',
                          'historical_capture_id': row['id'], 'manual_access_and_content_review': 'pending'})
    (OUT / 'public-fetches.json').write_text(json.dumps({'attempts': results, 'pairs': pairs}, indent=2), encoding='utf-8')
    print(json.dumps({'attempts': len(results), 'successful_fetches': sum(r['success'] for r in results), 'candidate_pairs': len(pairs)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch', type=int, default=0)
    args = parser.parse_args()
    fetch_pairs(args.fetch) if args.fetch else decode_all()
