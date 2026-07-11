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

# Sync to VPS (rsync mirrors the post-commit hook; scp -r recopied .git every time)
echo "📤 Syncing to VPS..."
rsync -az --exclude='.git' -e ssh ./ da:/root/salmanadnan.com/

echo "✅ Deployment complete!"
echo "   Live at: https://salmanadnan.com"
