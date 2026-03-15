"""归档解压服务 — 支持 tar.gz / zip / rar，递归搜索 profiling 数据根目录。"""

import os
import shutil
import tarfile
import zipfile
from pathlib import Path

try:
    import rarfile
except ImportError:
    rarfile = None

# 用于识别 profiling 数据的标记文件/目录
PROFILING_MARKERS = [
    "kernel_details.csv",
    "op_summary",
    "step_trace",
    "ASCEND_PROFILER_OUTPUT",
]

MAX_EXTRACTED_SIZE = 10 * 1024 * 1024 * 1024  # 10 GB


def _is_path_safe(member_path: str, dest: Path) -> bool:
    """防止 zip-slip 路径穿越攻击。"""
    resolved = (dest / member_path).resolve()
    return str(resolved).startswith(str(dest.resolve()))


def extract_archive(archive_path: Path, dest_dir: Path) -> Path:
    """解压归档文件到目标目录，返回解压后的根目录。"""
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = archive_path.name.lower()

    if name.endswith((".tar.gz", ".tgz", ".tar.bz2", ".tar")):
        _extract_tar(archive_path, dest_dir)
    elif name.endswith(".zip"):
        _extract_zip(archive_path, dest_dir)
    elif name.endswith(".rar"):
        _extract_rar(archive_path, dest_dir)
    else:
        raise ValueError(f"不支持的归档格式: {archive_path.name}")

    # Remove macOS resource fork files (._*) that crash CSV parsers
    _remove_resource_forks(dest_dir)

    return dest_dir


def _remove_resource_forks(base_dir: Path):
    """Remove macOS ._* resource fork files."""
    for p in base_dir.rglob("._*"):
        if p.is_file():
            p.unlink(missing_ok=True)


def _extract_tar(archive_path: Path, dest: Path):
    total = 0
    with tarfile.open(archive_path, "r:*") as tf:
        for member in tf.getmembers():
            if not _is_path_safe(member.name, dest):
                raise ValueError(f"路径穿越: {member.name}")
            if member.isfile():
                total += member.size
                if total > MAX_EXTRACTED_SIZE:
                    raise ValueError("解压后文件总大小超过限制")
        # filter="data" requires Python 3.12+
        import sys
        if sys.version_info >= (3, 12):
            tf.extractall(dest, filter="data")
        else:
            tf.extractall(dest)


def _extract_zip(archive_path: Path, dest: Path):
    total = 0
    with zipfile.ZipFile(archive_path, "r") as zf:
        for info in zf.infolist():
            if not _is_path_safe(info.filename, dest):
                raise ValueError(f"路径穿越: {info.filename}")
            total += info.file_size
            if total > MAX_EXTRACTED_SIZE:
                raise ValueError("解压后文件总大小超过限制")
        zf.extractall(dest)


def _extract_rar(archive_path: Path, dest: Path):
    if rarfile is None:
        raise ValueError("需要安装 rarfile 包和 unrar 命令来解压 .rar 文件")
    with rarfile.RarFile(str(archive_path), "r") as rf:
        for info in rf.infolist():
            if not _is_path_safe(info.filename, dest):
                raise ValueError(f"路径穿越: {info.filename}")
        rf.extractall(dest)


def find_profiling_root(base_dir: Path) -> Path | None:
    """递归搜索 profiling 数据根目录。

    搜索标记:
    - op_summary*.csv / kernel_details*.csv
    - ASCEND_PROFILER_OUTPUT/ 目录
    - PROF_* 前缀目录
    """
    # 1. 搜索包含标记文件的目录
    for root, dirs, files in os.walk(base_dir):
        root_path = Path(root)
        for f in files:
            f_lower = f.lower()
            for marker in PROFILING_MARKERS:
                if marker.lower() in f_lower:
                    return root_path

        for d in dirs:
            if d == "ASCEND_PROFILER_OUTPUT" or d.startswith("PROF_"):
                return root_path

    # 2. 如果没找到标记，返回解压根目录让分析脚本自行搜索
    return base_dir
