#!/bin/bash
# 下载 Perfetto UI 静态文件用于内网部署。
# 用法: bash scripts/download_perfetto.sh
#
# 下载后 Perfetto UI 将通过 /static/perfetto/ 提供服务，
# 无需访问外部网络。

set -e

DEST="static/perfetto"
PERFETTO_URL="https://ui.perfetto.dev"

echo "=== 下载 Perfetto UI 到 $DEST ==="

mkdir -p "$DEST"

# 使用 wget 镜像 Perfetto UI (仅 HTML/JS/CSS/WASM)
if command -v wget &> /dev/null; then
    wget --mirror \
         --convert-links \
         --adjust-extension \
         --page-requisites \
         --no-parent \
         --reject="*.map" \
         --directory-prefix="$DEST" \
         --no-host-directories \
         "$PERFETTO_URL/" 2>&1 | tail -5

    echo ""
    echo "=== 下载完成 ==="
    echo "文件位置: $DEST"
    echo "大小: $(du -sh "$DEST" | cut -f1)"
    echo ""
    echo "Perfetto UI 将通过 /static/perfetto/ 自动提供服务。"
else
    echo "错误: 需要 wget 命令。"
    echo "  macOS: brew install wget"
    echo "  Ubuntu: apt install wget"
    exit 1
fi
