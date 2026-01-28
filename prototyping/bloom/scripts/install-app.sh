#!/bin/bash
# Install Bloom.app to /Applications

BLOOM_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="$BLOOM_DIR/dist/Bloom.app"
INSTALL_PATH="/Applications/Bloom.app"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ Bloom.app not found at $APP_PATH"
    echo "   Run 'pnpm build' first to create the app bundle."
    exit 1
fi

# Remove existing installation
if [ -e "$INSTALL_PATH" ]; then
    echo "🗑️  Removing existing Bloom.app from /Applications..."
    rm -rf "$INSTALL_PATH"
fi

# Create symlink to Applications
echo "🔗 Creating symlink to /Applications..."
ln -s "$APP_PATH" "$INSTALL_PATH"

echo "✅ Bloom.app installed!"
echo ""
echo "You can now:"
echo "  • Launch from Spotlight: type 'Bloom'"
echo "  • Launch from Finder: open /Applications/Bloom.app"
echo "  • Launch from Terminal: open -a Bloom"
echo ""
echo "🌸 Bloom will:"
echo "  • Start the gateway on port 3377"
echo "  • Start the UI on port 3000"
echo "  • Open your browser to http://localhost:3000"
echo "  • Run as a menu bar app (no dock icon)"
