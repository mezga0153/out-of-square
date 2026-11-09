#!/bin/sh
# Publish the app to outofsquare.tinetov.net (a Worker serving static files,
# see wrangler.jsonc). Ships what is committed, from a copy of HEAD, so work
# in progress in the working tree never goes out.
set -e
cd "$(dirname "$0")"
# the personal account tinetov.net lives in; pinned so a work login fails
# loudly instead of publishing there
export CLOUDFLARE_ACCOUNT_ID=5b599c00c72a707712ba9f65977a2acd
rm -rf dist
mkdir dist
git archive HEAD index.html css js | tar -x -C dist
wrangler deploy
