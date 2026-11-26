#!/bin/sh
# Expose ./skills to Claude Code as .claude/skills (symlink; falls back to copy on systems without symlinks).
set -e
cd "$(dirname "$0")/.."
mkdir -p .claude
rm -rf .claude/skills
ln -s ../skills .claude/skills 2>/dev/null || cp -R skills .claude/skills
echo "linked skills -> .claude/skills"
