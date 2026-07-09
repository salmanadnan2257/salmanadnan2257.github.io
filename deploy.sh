#!/bin/bash
set -e

echo "🚀 Deploying portfolio to salmanadnan.com..."

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main || echo "⚠️  Already up to date"

# Sync to VPS
echo "📤 Syncing to VPS..."
scp -r . da:/root/salmanadnan.com/

echo "✅ Deployment complete!"
echo "   Live at: https://salmanadnan.com"
