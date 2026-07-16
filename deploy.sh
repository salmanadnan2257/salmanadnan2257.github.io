#!/bin/bash
set -e

# Safety gate: deploy only when the latest commit message opts in with "[deploy]".
# Any commit without that marker leaves GitHub and the VPS untouched.
LAST_MSG="$(git log -1 --pretty=%B)"
if [[ "$LAST_MSG" != *"[deploy]"* ]]; then
  echo "⏸  Latest commit message has no [deploy] marker; not pushing, not syncing."
  echo "   To deploy: commit with \"[deploy]\" in the message, then rerun ./deploy.sh"
  exit 0
fi

echo "🚀 Deploying portfolio to salmanadnan.com and ai.digitalise.agency..."

# Build the agency variant FIRST, before anything ships anywhere. Its guard exits
# non-zero if the personal identity leaked into agency chrome, if first-person copy
# survived, or if an unclassified "Salman" appeared; set -e then aborts the whole
# deploy. Building first is deliberate: if the guard fails, neither site ships,
# rather than salmanadnan.com going out and the agency build failing behind it.
echo "🏗  Building ai.digitalise.agency variant..."
python3 build-agency.py

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main || echo "⚠️  Already up to date"

# Sync to VPS (rsync mirrors the post-commit hook; scp -r recopied .git every time).
# tests/node_modules and tests/out are dev-only artifacts (56M once deps are
# installed and screenshots pile up); they are never part of the site, so keep them
# off the production web root. --delete is still deliberately absent (see README).
echo "📤 Syncing to VPS..."
rsync -az --exclude='.git' --exclude='tests/node_modules' --exclude='tests/out' -e ssh ./ da:/root/salmanadnan.com/

# The agency web root is a generated mirror, so --delete IS correct here: a file
# that build-agency.py stops emitting (portrait.webp, say) must not linger on the
# server. That is the opposite of the personal root above, which is hand-authored
# and where --delete is deliberately absent (see README).
echo "📤 Syncing agency build to VPS..."
rsync -az --delete -e ssh /tmp/ai-digitalise-build/ da:/root/ai.digitalise.agency/

echo "✅ Deployment complete!"
echo "   Live at: https://salmanadnan.com"
echo "   Live at: https://ai.digitalise.agency"
