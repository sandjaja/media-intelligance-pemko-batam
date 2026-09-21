#!/usr/bin/env python3
"""Anonymous Instaloader proof-of-concept for a public Instagram profile.

No login, no session file, no media download, and no database writes.
Usage: python instagram_instaloader_poc.py diskominfobatam
"""
import json
import sys

try:
    import instaloader
except ImportError:
    print(json.dumps({"ok": False, "error": "INSTALOADER_NOT_INSTALLED"}))
    raise SystemExit(2)

handle = (sys.argv[1] if len(sys.argv) > 1 else "diskominfobatam").strip().lstrip("@")
if not handle or len(handle) > 30:
    print(json.dumps({"ok": False, "error": "INVALID_HANDLE"}))
    raise SystemExit(2)

loader = instaloader.Instaloader(
    download_pictures=False,
    download_videos=False,
    download_video_thumbnails=False,
    download_geotags=False,
    download_comments=False,
    save_metadata=False,
    compress_json=False,
)

try:
    profile = instaloader.Profile.from_username(loader.context, handle)
    result = {
        "ok": True,
        "mode": "anonymous_public_profile",
        "username": profile.username,
        "userid": profile.userid,
        "followers": profile.followers,
        "following": profile.followees,
        "posts": profile.mediacount,
        "verified": profile.is_verified,
        "private": profile.is_private,
        "business": profile.is_business_account,
        "biography": profile.biography,
    }
except Exception as exc:
    result = {
        "ok": False,
        "mode": "anonymous_public_profile",
        "username": handle,
        "errorType": type(exc).__name__,
        "error": str(exc)[:500],
    }

print(json.dumps(result, ensure_ascii=False))
