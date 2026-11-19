#!/usr/bin/env python3
"""Authorization header must not leak to non-Notion hosts."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import logo_utils  # noqa: E402

NOTION_HDRS = {"Authorization": "Bearer ntn_test_secret", "Notion-Version": "2022-06-28"}


class NotionHeadersTest(unittest.TestCase):
    def test_api_notion_gets_headers(self):
        self.assertEqual(
            logo_utils.notion_only_headers("https://api.notion.com/v1/pages/x", NOTION_HDRS),
            NOTION_HDRS,
        )

    def test_s3_gets_no_auth(self):
        url = "https://prod-files-secure.s3.us-west-2.amazonaws.com/bucket/file.png?X-Amz-Signature=abc"
        out = logo_utils.notion_only_headers(url, NOTION_HDRS)
        self.assertIsNone(out)

    def test_clearbit_gets_no_auth(self):
        self.assertIsNone(
            logo_utils.notion_only_headers("https://logo.clearbit.com/example.com", NOTION_HDRS)
        )

    def test_http_get_never_sends_auth_to_s3(self):
        seen = {}

        def fake_urlopen(req, timeout=20):
            seen["headers"] = dict(req.header_items())
            class R:
                def read(self):
                    return b"\xff\xd8\xff\xe0" + b"\x00" * 400

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    pass

            return R()

        with patch("urllib.request.urlopen", fake_urlopen):
            logo_utils.http_get(
                "https://prod-files-secure.s3.us-west-2.amazonaws.com/x.png",
                headers=logo_utils.notion_only_headers(
                    "https://prod-files-secure.s3.us-west-2.amazonaws.com/x.png", NOTION_HDRS
                ),
            )
        self.assertNotIn("Authorization", seen.get("headers", {}))


if __name__ == "__main__":
    unittest.main()