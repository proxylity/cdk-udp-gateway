#!/usr/bin/env bash
# Produce all five language artifacts into dist/ via jsii-pacmak:
#   dist/js      — npm tarball
#   dist/python  — wheel + sdist
#   dist/dotnet  — NuGet package
#   dist/java    — Maven artifact
#   dist/go      — Go module source
# Requires each language toolchain in the build image (see build/package.yml runtime-versions).
set -ex

export JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1

echo "Packaging in ${CODEBUILD_SRC_DIR:-$(pwd)}"

# Dependencies and a fresh compile (the package stage runs independently of checks).
npm ci
npm run compile

# Build every target. jsii-pacmak reads jsii.targets from package.json.
npm run package

echo "Artifacts produced under dist/:"
find dist -maxdepth 2 -type f \
  \( -name '*.tgz' -o -name '*.whl' -o -name '*.tar.gz' -o -name '*.nupkg' -o -name '*.jar' -o -name 'go.mod' \) \
  -print
