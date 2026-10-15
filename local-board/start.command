#!/bin/sh
# macOS 双击启动：在“终端”里运行同目录的 start.sh
cd "$(dirname "$0")" || exit 1
exec sh ./start.sh
