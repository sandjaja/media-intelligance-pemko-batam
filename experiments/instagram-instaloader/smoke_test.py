#!/usr/bin/env python3
"""Anonymous Instaloader smoke test. Does not download media or persist data."""
import json, sys
try:
    import instaloader
except Exception as exc:
    print(json.dumps({"ok":False,"stage":"import","error":str(exc)})); raise SystemExit(2)

username=(sys.argv[1] if len(sys.argv)>1 else "diskominfobatam").lstrip("@")
try:
    loader=instaloader.Instaloader(download_pictures=False,download_videos=False,download_video_thumbnails=False,download_geotags=False,download_comments=False,save_metadata=False,compress_json=False,quiet=True)
    profile=instaloader.Profile.from_username(loader.context,username)
    print(json.dumps({"ok":True,"username":profile.username,"userid":profile.userid,"followers":profile.followers,"following":profile.followees,"posts":profile.mediacount,"verified":profile.is_verified,"private":profile.is_private,"business":profile.is_business_account},ensure_ascii=False))
except Exception as exc:
    print(json.dumps({"ok":False,"stage":"profile","username":username,"errorType":type(exc).__name__,"error":str(exc)[:500]},ensure_ascii=False)); raise SystemExit(1)
