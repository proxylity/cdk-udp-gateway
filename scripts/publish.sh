#!/usr/bin/env bash
# Publish stub. This repo intentionally does NOT publish; the real CodeBuild project enables the
# per-registry steps once publish credentials are provisioned (referenced via parameter-store /
# secrets-manager in build/publish.yml — NEVER as literal secrets here).
#
# As a stub, this script lists the artifacts it WOULD publish and exits 0 without contacting any
# registry. Each publish command below is left commented out as a template; the credential names
# match the placeholders in build/publish.yml and are read from the environment, never hardcoded.
set -ex

echo "Publish stub — no artifacts will be pushed to any registry."

if [ -d dist ]; then
  echo "Artifacts that WOULD be published:"
  find dist -maxdepth 2 -type f \
    \( -name '*.tgz' -o -name '*.whl' -o -name '*.tar.gz' -o -name '*.nupkg' -o -name '*.jar' \) \
    -print
else
  echo "No dist/ directory found (did the package stage run?)."
fi

# --- Templates (disabled). Enable in the real build once credentials exist. ---
#
# npm (uses NPM_TOKEN + NPM_REGISTRY):
#   echo "//${NPM_REGISTRY#https://}/:_authToken=${NPM_TOKEN}" > ~/.npmrc
#   npm publish dist/js/*.tgz --access public
#
# PyPI (uses PYPI_TOKEN + PYPI_REPOSITORY_URL):
#   python -m twine upload --repository-url "${PYPI_REPOSITORY_URL}" \
#     -u __token__ -p "${PYPI_TOKEN}" dist/python/*
#
# NuGet (uses NUGET_API_KEY + NUGET_SOURCE):
#   dotnet nuget push dist/dotnet/*.nupkg --api-key "${NUGET_API_KEY}" --source "${NUGET_SOURCE}"
#
# Maven (uses MAVEN_USERNAME/MAVEN_PASSWORD + MAVEN_REPOSITORY_URL):
#   # mvn deploy with a settings.xml referencing the env credentials
#
# Go (uses GO_MODULE_PROXY): Go modules publish by tagging the source repo; no artifact push.

echo "Publish stub complete."
exit 0
