#!/usr/bin/env python3
"""Pack plugin-integration into dist/test-bridge-<version>.otzplugin and print SHA-256."""
import hashlib, json, os, sys, zipfile
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=os.path.join(ROOT,"plugin-integration")
with open(os.path.join(SRC,"manifest.json"),encoding="utf-8") as f: manifest=json.load(f)
FILES=["manifest.json","index.html","main.js","js/bridge-policy.js","js/bridge-core.js","js/pdf-filter.js"]
for name in FILES:
    if not os.path.isfile(os.path.join(SRC,name)): sys.exit("missing required plugin file: "+name)
os.makedirs(os.path.join(ROOT,"dist"),exist_ok=True)
out=os.path.join(ROOT,"dist","%s-%s.otzplugin" % (manifest["id"],manifest["version"]))
with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
    for name in FILES: z.write(os.path.join(SRC,name),name)
with open(out,"rb") as f: digest=hashlib.sha256(f.read()).hexdigest()
print(out); print(digest)
