#!/usr/bin/env bash
# The build judge: continuous typecheck + tests -> .judge/results.json (lanes read this)
mkdir -p .judge
npx tsc --noEmit --watch --preserveWatchOutput 2>&1 | tee .judge/tsc.log &
npx vitest --watch --reporter=json --outputFile=.judge/results.json
