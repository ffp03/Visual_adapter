import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location('bounded_benchmark', Path(__file__).with_name('bounded_benchmark.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TaggedBenchmarkTests(unittest.TestCase):
    def test_selected_tag_controls_resume_file_and_child_command(self):
        # Retained under project scratch: never remove old experimental evidence.
        scratch = Path(tempfile.mkdtemp(prefix='bounded-test-', dir=MODULE.OUT))
        (scratch / 'public-fetches.json').write_text(json.dumps({'attempts': [
            {'id': 'already', 'success': True}, {'id': 'new', 'success': True}]}), encoding='utf-8')
        (scratch / 'fresh-benchmark.json').write_text(json.dumps({'results': [
            {'id': 'already', 'available': True}]}), encoding='utf-8')
        (scratch / 'public-benchmark.json').write_text('must not load this unrelated run', encoding='utf-8')
        completed = subprocess.CompletedProcess([], 0, '', '')
        with patch.object(MODULE, 'OUT', scratch), patch.object(MODULE.subprocess, 'run', return_value=completed) as run, contextlib.redirect_stdout(io.StringIO()):
            MODULE.main(['--tag', 'fresh', '--seconds', '10', '--per-page', '5'])
        self.assertEqual(run.call_count, 1)
        command = run.call_args.args[0]
        self.assertIn('--tag=fresh', command)
        self.assertIn('--page-id=new', command)
        self.assertTrue((scratch / 'fresh-bounded-benchmark-events.json').exists())

    def test_tag_cannot_escape_output_directory(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            MODULE.main(['--tag', '../outside'])


if __name__ == '__main__':
    unittest.main()
