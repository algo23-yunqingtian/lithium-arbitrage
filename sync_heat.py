#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_heat.py — 每日「热度数据」(SMM 日度情绪因子) 入库脚本
============================================================
设计目标：把用户本地的 SMM 情绪因子（成交/出货/购货，日度）合并写入
仓库 data/heat.json（GitHub 即云数据库，GitHub Pages 提供）。

典型流程（每天 16:00 后）：
  1. 用户在 Excel 里刷「有色网插件」，SMM 情绪因子新数据写入本地 xlsx；
  2. 运行本脚本（或双击 sync_heat.ps1）：读 xlsx → 按日期去重合并 → 写 data/heat.json；
  3. sync_heat.ps1 接着 git add/commit/push，GitHub Pages 自动更新。

用法：
  python sync_heat.py              # 用内置 SOURCES 配置读入并合并
  python sync_heat.py --dry-run    # 只打印将写入的天数，不落盘
  python sync_heat.py --print      # 打印合并结果摘要

依赖：Python 3 + openpyxl（pip install openpyxl）。仅在本地机器运行（GitHub Actions 无本地 xlsx）。
"""
import argparse
import datetime
import json
import os
import sys

# ---- 源配置：每种品种的 xlsx + 工作表 + 日期列 + 情绪系列列映射（列字母 -> 键名） ----
# 用户后续更换/新增数据源时，只需改这里（或加一个 dict 元素）。
SOURCES = [
    {
        "variety": "LC", "label": "碳酸锂",
        "path": r"D:\Users\YAQH\Desktop\AI碳酸锂.xlsx",
        "sheet": "日度价", "date_col": "A", "header_row": 1, "data_start": 5,
        "series": {"K": "成交", "L": "出货", "M": "购货"},
    },
    {
        "variety": "LTH", "label": "氢氧化锂",
        "path": r"D:\Users\YAQH\Desktop\氢氧化锂数据-田允晴.xlsx",
        "sheet": "出购货情绪因子", "date_col": "H", "header_row": 8, "data_start": 12,
        "series": {"I": "成交", "J": "出货", "K": "购货"},
    },
]

HEAT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "heat.json")
SERIES_ORDER = ["成交", "出货", "购货"]


def read_source(src):
    """读取一个源配置：返回 {date: {key: value}}（仅非空数值行）。"""
    try:
        import openpyxl
    except ImportError:
        print("缺少 openpyxl，请先: pip install openpyxl", file=sys.stderr)
        return {}
    if not os.path.exists(src["path"]):
        print("  跳过（文件不存在）: %s" % src["path"])
        return {}
    wb = openpyxl.load_workbook(src["path"], read_only=True, data_only=True)
    if src["sheet"] not in wb.sheetnames:
        print("  跳过（表不存在 %s）: %s" % (src["sheet"], src["path"]))
        wb.close()
        return {}
    ws = wb[src["sheet"]]
    dc = openpyxl.utils.column_index_from_string(src["date_col"])
    colmap = {openpyxl.utils.column_index_from_string(c): k for c, k in src["series"].items()}
    maxcol = max(dc, max(colmap))
    out = {}
    for row in ws.iter_rows(min_row=src["data_start"], max_col=maxcol, values_only=True):
        if len(row) < maxcol:
            continue
        dv = row[dc - 1]
        if dv in (None, ""):
            continue
        try:
            d = datetime.datetime.strptime(str(dv)[:10], "%Y-%m-%d").date().isoformat()
        except Exception:
            continue
        rec = {}
        for ci, key in colmap.items():
            v = row[ci - 1]
            if v in (None, ""):
                continue
            try:
                rec[key] = float(v)
            except Exception:
                pass
        if rec:
            out[d] = rec
    wb.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="不写盘，只打印统计")
    ap.add_argument("--print", action="store_true", help="打印摘要")
    args = ap.parse_args()

    # 读已有 heat.json
    data = {}
    if os.path.exists(HEAT_PATH):
        try:
            with open(HEAT_PATH, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print("  读取现有 heat.json 失败，将重建: %s" % e)
            data = {}
    days = {d["date"]: d for d in data.get("days", []) if isinstance(d, dict) and d.get("date")}

    # 逐源合并
    stats = {}
    for src in SOURCES:
        s = read_source(src)
        stats[src["variety"]] = len(s)
        for d, rec in s.items():
            day = days.setdefault(d, {"date": d, "LC": None, "LTH": None})
            day[src["variety"]] = rec

    out_days = [days[k] for k in sorted(days)]
    now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    meta = {
        "version": 1,
        "source": "SMM 有色网插件 · 日度情绪因子（成交/出货/购货）",
        "updated": now,
        "note": "每日16点后刷新插件→运行 sync_heat.py（或 sync_heat.ps1）入库；算术指标待用户提供公式后扩展（meta.extendable）",
        "series": {"LC": ["成交", "出货", "购货"], "LTH": ["成交", "出货", "购货"]},
        "counts": stats,
        "days": len(out_days),
    }
    result = {"meta": meta, "days": out_days}

    if args.dry_run:
        print("[dry-run] 将写入 %d 天；各源点数: %s" % (len(out_days), stats))
        return 0
    if args.print:
        print("[print] 合计 %d 天；各源点数: %s；最后5天:" % (len(out_days), stats))
        for d in out_days[-5:]:
            print("   ", d)
        return 0

    os.makedirs(os.path.dirname(HEAT_PATH), exist_ok=True)
    with open(HEAT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print("[OK] data/heat.json 已更新：%d 天（%s → %s）；各源点数: %s" %
          (len(out_days), out_days[0]["date"] if out_days else "-",
           out_days[-1]["date"] if out_days else "-", stats))
    return 0


if __name__ == "__main__":
    sys.exit(main())
