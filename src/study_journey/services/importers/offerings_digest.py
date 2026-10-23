"""开课数据的序列化与版本指纹（导入和下载共用，不依赖 Excel 库）。"""
from __future__ import annotations

import hashlib
import json


def dumps(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def content_version(data: dict) -> str:
    """数据内容的指纹（不含生成日期）：内容不变，版本就不变。"""
    body = {k: v for k, v in data.items() if k != "generated"}
    return hashlib.sha256(dumps(body).encode("utf-8")).hexdigest()[:12]
