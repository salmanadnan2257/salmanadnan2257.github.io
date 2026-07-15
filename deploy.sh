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

echo "🚀 Deploying portfolio to salmanadnan.com..."

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main || echo "⚠️  Already up to date"

# Sync to VPS (rsync mirrors the post-commit hook; scp -r recopied .git every time).
# tests/node_modules and tests/out are dev-only artifacts (56M once deps are
# installed and screenshots pile up); they are never part of the site, so keep them
# off the production web root. --delete is still deliberately absent (see README).
echo "📤 Syncing to VPS..."
rsync -az --exclude='.git' --exclude='tests/node_modules' --exclude='tests/out' -e ssh ./ da:/root/salmanadnan.com/

echo "✅ Deployment complete!"
echo "   Live at: https://salmanadnan.com"
