#!/bin/sh
# 秋招信库 · 本地投递看板（macOS / Linux）。用法：sh start.sh
cd "$(dirname "$0")" || exit 1

open_download() {
  url="https://nodejs.org/zh-cn/download"
  if command -v open >/dev/null 2>&1; then open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1
  else echo "请在浏览器打开：$url"; fi
}

if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js。本地投递看板需要 Node.js 18 或更高版本。"
  echo "即将打开 Node.js 下载页面：请下载“LTS”版本并安装，安装完成后重新运行本脚本。"
  open_download
  printf "按回车键退出……"; read -r _
  exit 1
fi

major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" -lt 18 ]; then
  echo "当前 Node.js 版本过低（主版本 $major），本地投递看板需要 18 或更高版本。"
  echo "即将打开 Node.js 下载页面：请安装新的“LTS”版本后重新运行本脚本。"
  open_download
  printf "按回车键退出……"; read -r _
  exit 1
fi

echo "正在启动本地投递看板，稍后会自动打开浏览器。"
echo "使用期间请不要关闭这个窗口；关闭窗口或按 Ctrl+C 即可停止服务。"
echo
node server.mjs --open
# 退出码 3：看板已经在另一个窗口运行，浏览器已打开，不需要再停留
if [ $? -eq 3 ]; then sleep 2; exit 0; fi
echo
printf "本地看板已停止，按回车键关闭窗口……"; read -r _
