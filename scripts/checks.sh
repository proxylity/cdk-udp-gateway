#!/usr/bin/env bash
# Lint, jsii-compile, and run the jest/assertions tests (including the packet-counter synth-diff
# golden test). Mirrors the proxylity-control house style: bash, set -ex, CODEBUILD_* env.
set -ex

# jsii warns loudly when run on an untested Node major; silence it for a clean CI log.
export JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1

echo "Running checks in ${CODEBUILD_SRC_DIR:-$(pwd)}"

# Reproducible install from the lockfile.
npm ci

# Lint TypeScript sources and tests.
npm run lint

# jsii compile (produces .jsii + lib/) — must succeed with zero errors.
npm run compile

# Unit + golden synth tests (jest via aws-cdk-lib/assertions). Synth-only, no live AWS calls.
npm test
