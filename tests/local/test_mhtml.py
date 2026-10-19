import unittest
from corpus import decode_mhtml


class MhtmlTests(unittest.TestCase):
    def test_start_selects_root_after_iframe_and_decodes_charset(self):
        raw = b'MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="b"; start="<root>"\r\n\r\n--b\r\nContent-Type: text/html\r\nContent-ID: <frame>\r\n\r\nWrong iframe\r\n--b\r\nContent-Type: text/html; charset=iso-8859-1\r\nContent-ID: <root>\r\nContent-Location: https://example.org/root\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>caf=E9 soft=\r\nline</p>\r\n--b--\r\n'
        html, meta = decode_mhtml(raw)
        self.assertIn('caf\u00e9 softline', html)
        self.assertNotIn('Wrong iframe', html)
        self.assertEqual(meta['html_parts'], 2)

    def test_snapshot_location_beats_first_iframe_and_meta_utf8(self):
        raw = b'Snapshot-Content-Location: https://example.org/root\nContent-Type: multipart/related; boundary=b\n\n--b\nContent-Type: text/html\nContent-Location: https://example.org/frame\n\nwrong\n--b\nContent-Type: text/html\nContent-Location: https://example.org/root\nContent-Transfer-Encoding: quoted-printable\n\n<meta charset="utf-8"><p>caf=C3=A9</p>\n--b--\n'
        html, meta = decode_mhtml(raw)
        self.assertIn('caf\u00e9', html)
        self.assertEqual(meta['root_selection'], 'snapshot Content-Location')

    def test_ambiguous_root_is_excluded(self):
        raw = b'Content-Type: multipart/related; boundary=b\n\n--b\nContent-Type: text/plain\n\nplain\n--b\nContent-Type: text/html\n\niframe\n--b--\n'
        with self.assertRaises(ValueError):
            decode_mhtml(raw)


if __name__ == '__main__':
    unittest.main()
