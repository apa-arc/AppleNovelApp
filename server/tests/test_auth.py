import tempfile
import unittest
from pathlib import Path

from server.auth import hash_device_token, issue_device_token, is_device_token_valid, revoke_device_token


class DeviceAuthTests(unittest.TestCase):
    def test_enrollment_issues_only_valid_device_tokens(self):
        with tempfile.TemporaryDirectory() as directory:
            database = str(Path(directory) / "data" / "tokens.sqlite3")
            token = issue_device_token("a-secure-code", "a-secure-code", database)
            self.assertGreaterEqual(len(token), 32)
            self.assertTrue(is_device_token_valid(token, database))
            self.assertEqual(len(hash_device_token(token)), 64)

    def test_invalid_or_unconfigured_enrollment_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            database = str(Path(directory) / "tokens.sqlite3")
            with self.assertRaises(PermissionError):
                issue_device_token("wrong-code", "right-code", database)
            with self.assertRaises(RuntimeError):
                issue_device_token("any-code", "", database)

    def test_device_token_can_be_revoked(self):
        with tempfile.TemporaryDirectory() as directory:
            database = str(Path(directory) / "tokens.sqlite3")
            token = issue_device_token("secure-code", "secure-code", database)
            self.assertTrue(revoke_device_token(token, database))
            self.assertFalse(is_device_token_valid(token, database))
            self.assertFalse(revoke_device_token(token, database))


if __name__ == "__main__":
    unittest.main()
