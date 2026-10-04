#!/usr/bin/env python3
"""合併兒童複習單字庫與 7,000 實用英語單字批次檔，並整合公開權威 CEFR 字表（Oxford 3000/5000、CEFR-J、Octanove）。

輸入（皆位於 source/）：
  - child-review-vocabulary-database.json（主表，不修改）
  - vocabulary_*.json（140 個批次檔，提供新詞條、定義與補充例句）
  - tools/cefr_sources/：
      - oxford-3000.tsv, oxford-5000-expanded.tsv (Oxford 3000/5000, A1–C1)
      - cefrj-vocabulary-profile-1.5.csv (CEFR-J 1.5, A1–B2)
      - octanove-vocabulary-profile-c1c2-1.0.csv (Octanove, C1–C2)
輸出：
  - child-review-vocabulary-database-merged.json
  - 合併報告（Markdown，路徑由 --report 指定，預設 tools/merge_vocabulary_report.md）

規則摘要（2026-10-05 與使用者確認）：
  1. DB 詞條的複合寫法拆成獨立單字：
     - 斜線：gray/grey -> gray、grey
     - 字尾括號：pay(ment) -> pay、payment；glove(s) -> glove、gloves；capital(ism) -> capital、capitalism
     - 完整字括號：argue(argument) -> argue、argument
     - 代名詞變化：I (me, my, mine, myself) -> I、me、my、mine、myself
     拆出的單字各複製 definition、category、scenario、level、list、parts_of_speech、explains；
     examples 依句中出現的字形（含 -s/-es/-d/-ed/-ing）分配，未出現任何字形者歸第一字形；
     同名合併後仍分不到例句的字形複製原詞條全部例句。
  2. 拆出後同名（大小寫視為不同）即合併：definition 以「；」去重合併，
     examples／explains／category／scenario／parts_of_speech 去重合併，
     level 取最小、list 取最基礎（basic > advance > expert）。
  3. id：每個原詞條的第一字形沿用原 id；同名合併時保留最小原 id；
     其餘拆出字形自 6013 起依序編號，之後才是批次檔新詞條。
  4. CEFR 分級整合規則（選項 A）：
     - 整合 7,000 實用單字批次、Oxford 3000/5000、CEFR-J 1.5、Octanove C1/C2 等公開權威字表。
     - 若單字在單一或多個來源中有多個分級，一律取最低／最基礎級別（A1 < A2 < B1 < B2 < C1 < C2）。
     - 支持基礎屈折字形對齊（如單複數拆出的 gloves 對齊 glove）。
     - 所有來源皆無收錄者維持 null。
  5. 批次檔單字：
     - 已存在：若 definition 為空則補入批次檔定義；不補例句。
     - 不存在：新增詞條，level／list 為 null，category／explains 為空陣列，
       topic 去重放入 scenario，例句去重保留，pos 轉為 parts_of_speech 陣列。
  6. GUID 使用 UUID v5（固定命名空間），單字依「word」、例句依「word＋en＋zh」、
     explain 依「word＋en」計算，全檔不重複且重跑結果相同。
"""

from __future__ import annotations

import argparse
import copy
import csv
import glob
import json
import os
import re
import uuid
from collections import Counter, OrderedDict

SOURCE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(SOURCE_DIR, "child-review-vocabulary-database.json")
BATCH_GLOB = os.path.join(SOURCE_DIR, "vocabulary_*.json")
OUT_PATH = os.path.join(SOURCE_DIR, "child-review-vocabulary-database-merged.json")
DEFAULT_REPORT = os.path.join(SOURCE_DIR, "tools", "merge_vocabulary_report.md")
CEFR_SOURCES_DIR = os.path.join(SOURCE_DIR, "tools", "cefr_sources")

GUID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "englishlearning/child-review-vocabulary")
CEFR_ORDER = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}
LIST_ORDER = {"basic": 1, "advance": 2, "expert": 3}
SUFFIXES = {"ment", "s", "ism"}
DEF_SEP = "；"


# ---------------------------------------------------------------- 工具函式

def split_db_word(word: str) -> list[str]:
    """把 DB 詞條拆成獨立單字（保留出現順序、去重）。"""
    forms: list[str] = []
    for part in word.split("/"):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^(.*?)\s*\((.*?)\)\s*(.*)$", part)
        if not m:
            forms.append(part)
            continue
        base = (m.group(1) + m.group(3)).strip()
        inner = m.group(2).strip()
        forms.append(base)
        if "," in inner:  # 代名詞變化形
            forms.extend(x.strip() for x in inner.split(",") if x.strip())
        elif inner in SUFFIXES:
            forms.append(m.group(1).strip() + inner + m.group(3).strip())
        else:  # argue(argument)
            forms.append(inner)
    return list(OrderedDict.fromkeys(forms))


def split_batch_word(word: str) -> list[str]:
    """批次檔只以含空白的「 / 」拆分（A/B testing 視為單一詞）。"""
    parts = [p.strip() for p in re.split(r"\s+/\s+", word.strip()) if p.strip()]
    return list(OrderedDict.fromkeys(parts))


def form_matches(form: str, sentence: str, siblings: set[str]) -> bool:
    """句中是否出現此字形。

    長度 ≥ 3 的字形允許 -s/-es/-d/-ed/-ing 變化（pay→pays）；
    短字（an、us、my）只做整字比對，避免 an 命中 and。
    變化後若剛好等於同組另一字形（her→hers），不算命中此字形。
    """
    suffix = r"(?:s|es|d|ed|ing)?" if len(form) >= 3 else ""
    pat = re.compile(r"(?<![A-Za-z])" + re.escape(form) + suffix + r"(?![A-Za-z])", re.IGNORECASE)
    for m in pat.finditer(sentence):
        text = m.group(0).lower()
        if text == form.lower() or text not in siblings:
            return True
    return False


def merge_definitions(*defs: str) -> str:
    items: list[str] = []
    for d in defs:
        for x in (d or "").split(DEF_SEP):
            x = x.strip()
            if x and x not in items:
                items.append(x)
    return DEF_SEP.join(items)


def union(*lists):
    out = []
    for lst in lists:
        for x in lst or []:
            if x not in out:
                out.append(x)
    return out


def union_examples(*lists):
    out, seen = [], set()
    for lst in lists:
        for ex in lst or []:
            key = (ex["en"], ex["zh"])
            if key in seen:
                continue
            seen.add(key)
            out.append({"en": ex["en"], "zh": ex["zh"]})
    return out


def min_by(values, order):
    vals = [v for v in values if v is not None]
    return min(vals, key=lambda v: order[v]) if vals else None


POS_PHRASE = re.compile(r"^(n|v|adj|adv|prep|interj|conj)\.\s*phr\.$")


def convert_pos(pos: str) -> list[str]:
    """'n. phr., v.' -> ['n', 'v']；'phr. v.' -> ['v']；'n. [U]' -> ['n']。"""
    out: list[str] = []
    for tok in pos.split(","):
        tok = re.sub(r"\[.*?\]", "", tok).strip()
        if not tok:
            continue
        if tok == "phr. v.":
            tag = "v"
        elif POS_PHRASE.match(tok):
            tag = POS_PHRASE.match(tok).group(1)
        elif tok.startswith("n. prop"):
            tag = "n"
        else:
            tag = tok.rstrip(".").strip()
        if tag and tag not in out:
            out.append(tag)
    return out


def guid(*parts: str) -> str:
    return str(uuid.uuid5(GUID_NAMESPACE, "\u241f".join(parts)))


def get_inflection_candidates(w: str) -> list[str]:
    """產生常見屈折變化候選詞（用於字表匹配，如複數轉單數）。"""
    cand = []
    if w.endswith("s"):
        cand.append(w[:-1])
    if w.endswith("es"):
        cand.append(w[:-2])
    if w.endswith("ies"):
        cand.append(w[:-3] + "y")
    if w.endswith("ed"):
        cand.append(w[:-2])
        cand.append(w[:-1])
    if w.endswith("ing"):
        cand.append(w[:-3])
        cand.append(w[:-3] + "e")
    cand.append(w + "s")
    cand.append(w + "es")
    return [c for c in cand if len(c) > 2]


# ---------------------------------------------------------------- 外部字表載入

def load_external_cefr_sources() -> tuple[dict[str, set[str]], dict[str, set[str]], dict[str, set[str]]]:
    """載入 Oxford 3000/5000、CEFR-J 1.5、Octanove C1/C2。"""
    oxford: dict[str, set[str]] = {}
    for fn in ["oxford-3000.tsv", "oxford-5000-expanded.tsv"]:
        fp = os.path.join(CEFR_SOURCES_DIR, fn)
        if not os.path.exists(fp):
            continue
        with open(fp, encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter="\t"):
                w = r["Word"].strip().lower()
                m = re.search(r"\b(A1|A2|B1|B2|C1|C2)\b", r["Level"], re.I)
                if w and m:
                    oxford.setdefault(w, set()).add(m.group(1).upper())

    cefrj: dict[str, set[str]] = {}
    cefrj_fp = os.path.join(CEFR_SOURCES_DIR, "cefrj-vocabulary-profile-1.5.csv")
    if os.path.exists(cefrj_fp):
        with open(cefrj_fp, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                for p in r["headword"].split("/"):
                    p = p.strip().lower()
                    lvl = r["CEFR"].strip().upper()
                    if p and lvl in CEFR_ORDER:
                        cefrj.setdefault(p, set()).add(lvl)

    octanove: dict[str, set[str]] = {}
    octanove_fp = os.path.join(CEFR_SOURCES_DIR, "octanove-vocabulary-profile-c1c2-1.0.csv")
    if os.path.exists(octanove_fp):
        with open(octanove_fp, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                for p in r["headword"].split("/"):
                    p = p.strip().lower()
                    lvl = r["CEFR"].strip().upper()
                    if p and lvl in CEFR_ORDER:
                        octanove.setdefault(p, set()).add(lvl)

    return oxford, cefrj, octanove


# ---------------------------------------------------------------- 主流程

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", default=DEFAULT_REPORT)
    args = ap.parse_args()

    with open(DB_PATH, encoding="utf-8") as f:
        db = json.load(f)
    original_entries = db["entries"]
    max_original_id = max(e["id"] for e in original_entries)

    report = {
        "split_entries": [],          # (原 word, [forms])
        "fallback_examples": [],      # (原 word, form)
        "collisions": [],             # (form, [來源 word])
        "dropped_ids": [],            # 合併後不再使用的原 id
        "batch_matched_def_filled": [],
        "cefr_resolution_sample": [], # 記錄多來源等級取低者的範例
        "new_from_batch": [],
    }

    # 1. 拆分 DB 詞條 ------------------------------------------------------
    words: "OrderedDict[str, dict]" = OrderedDict()
    sources: dict[str, list[str]] = {}
    fallback: dict[str, list[dict]] = {}

    for e in original_entries:
        forms = split_db_word(e["word"])
        if len(forms) > 1:
            report["split_entries"].append((e["word"], forms))
            assigned = {f: [] for f in forms}
            siblings = {f.lower() for f in forms}
            for ex in e["examples"]:
                hit = [f for f in forms if form_matches(f, ex["en"], siblings)]
                for f in hit or [forms[0]]:
                    assigned[f].append(ex)
            for f in forms:
                if not assigned[f]:
                    fallback.setdefault(f, []).append(e)
        else:
            assigned = {forms[0]: e["examples"]}

        for i, f in enumerate(forms):
            item = {
                "orig_id": e["id"] if i == 0 else None,
                "level": e["level"],
                "list": e["list"],
                "category": list(e["category"]),
                "scenario": list(e["scenario"]),
                "parts_of_speech": list(e["parts_of_speech"]),
                "examples": union_examples(assigned[f]),
                "definition": e["definition"],
                "explains": list(OrderedDict.fromkeys(e["explains"])),
                "cefr": None,
                "from_batch": False,
            }
            sources.setdefault(f, []).append(e["word"])
            if f not in words:
                words[f] = item
                continue
            # 同名合併
            cur = words[f]
            ids = [x for x in (cur["orig_id"], item["orig_id"]) if x is not None]
            keep = min(ids) if ids else None
            report["dropped_ids"].extend(x for x in ids if x != keep)
            cur["orig_id"] = keep
            cur["level"] = min([x for x in (cur["level"], item["level"]) if x is not None], default=None)
            cur["list"] = min_by([cur["list"], item["list"]], LIST_ORDER)
            cur["category"] = union(cur["category"], item["category"])
            cur["scenario"] = union(cur["scenario"], item["scenario"])
            cur["parts_of_speech"] = union(cur["parts_of_speech"], item["parts_of_speech"])
            cur["examples"] = union_examples(cur["examples"], item["examples"])
            cur["definition"] = merge_definitions(cur["definition"], item["definition"])
            cur["explains"] = union(cur["explains"], item["explains"])

    for f, srcs in sources.items():
        if len(srcs) > 1:
            report["collisions"].append((f, srcs))

    # 同名合併後仍分不到例句的字形，才複製其原詞條全部例句
    for f, origs in fallback.items():
        if not words[f]["examples"]:
            words[f]["examples"] = union_examples(*(o["examples"] for o in origs))
            report["fallback_examples"].extend((o["word"], f) for o in origs)

    # 2. 讀批次檔 ----------------------------------------------------------
    batch_items = []
    for path in sorted(glob.glob(BATCH_GLOB)):
        with open(path, encoding="utf-8") as f:
            batch_items.extend(json.load(f)["words"])
    batch_items.sort(key=lambda w: w["id"])

    batch_by_word: "OrderedDict[str, list[dict]]" = OrderedDict()
    batch_cefr_map: dict[str, set[str]] = {}
    for w in batch_items:
        for form in split_batch_word(w["word"]):
            batch_by_word.setdefault(form, []).append(w)
            lvl = w["cefr"].strip().upper()
            if lvl in CEFR_ORDER:
                batch_cefr_map.setdefault(form.lower(), set()).add(lvl)

    # 3. 讀外部權威字表 ----------------------------------------------------
    oxford_dict, cefrj_dict, octanove_dict = load_external_cefr_sources()

    # 4. 輔助函式：針對單字彙總所有來源 CEFR 並取最低級別（選項 A）
    def resolve_cefr(word_str: str) -> str | None:
        wl = word_str.lower()
        levels = set()
        if wl in batch_cefr_map:
            levels.update(batch_cefr_map[wl])
        if wl in oxford_dict:
            levels.update(oxford_dict[wl])
        if wl in cefrj_dict:
            levels.update(cefrj_dict[wl])
        if wl in octanove_dict:
            levels.update(octanove_dict[wl])

        # 若直接比對未命中，嘗試常見單複數等屈折詞形
        if not levels:
            for cand in get_inflection_candidates(wl):
                for src in [oxford_dict, cefrj_dict, octanove_dict, batch_cefr_map]:
                    if cand in src:
                        levels.update(src[cand])
                if levels:
                    break

        return min_by(levels, CEFR_ORDER)

    # 5. 套用批次資料與計算 CEFR -------------------------------------------
    # 先處理批次檔新詞條
    for form, items in batch_by_word.items():
        defs = merge_definitions(*(w["definition"] for w in items))
        if form in words:
            cur = words[form]
            if not cur["definition"]:
                cur["definition"] = defs
                report["batch_matched_def_filled"].append(form)
            continue

        words[form] = {
            "orig_id": None,
            "level": None,
            "list": None,
            "category": [],
            "scenario": union([w["topic"] for w in items]),
            "parts_of_speech": union(*(convert_pos(w["pos"]) for w in items)),
            "examples": union_examples(*(w["examples"] for w in items)),
            "definition": defs,
            "explains": [],
            "cefr": None,
            "from_batch": True,
        }
        report["new_from_batch"].append(form)

    # 全量更新／指派所有詞條的 CEFR
    for form, item in words.items():
        item["cefr"] = resolve_cefr(form)

    # 6. 編 id（先 DB 拆出字形，再批次新詞） -------------------------------
    next_id = max_original_id + 1
    for group in (False, True):
        for form, item in words.items():
            if item["orig_id"] is None and item["from_batch"] is group:
                item["orig_id"] = next_id
                next_id += 1

    # 7. 組輸出 ------------------------------------------------------------
    entries = []
    for form, item in words.items():
        entries.append({
            "id": item["orig_id"],
            "guid": guid("word", form),
            "level": item["level"],
            "list": item["list"],
            "cefr": item["cefr"],
            "category": item["category"],
            "scenario": item["scenario"],
            "word": form,
            "parts_of_speech": item["parts_of_speech"],
            "examples": [
                {"guid": guid("example", form, ex["en"], ex["zh"]), "en": ex["en"], "zh": ex["zh"]}
                for ex in item["examples"]
            ],
            "definition": item["definition"],
            "explains": [{"guid": guid("explain", form, t), "en": t} for t in item["explains"]],
        })
    entries.sort(key=lambda e: e["id"])

    # 8. metadata / statistics --------------------------------------------
    meta = copy.deepcopy(db["metadata"])
    meta["title"] = "兒童複習用英文單字庫（合併 7,000 實用英語單字及 Oxford / CEFR-J 分級）"
    meta["generated_on"] = "2026-10-05"
    meta["merged_from"] = [
        "child-review-vocabulary-database.json",
        "vocabulary_0001-0050.json … vocabulary_6951-7000.json（7,000 實用英語單字清單）",
        "Oxford 3000 & Oxford 5000 (A1–C1)",
        "CEFR-J Wordlist Version 1.5 (A1–B2, TUFS Tono Lab)",
        "Octanove Vocabulary Profile (C1–C2, Octanove Labs)",
    ]
    meta["entry_order"] = "依 id 排序：1–6012 為原高中詞彙表詞條（拆分後第一字形沿用原 id），其後為拆分出的字形，再其後為 7,000 字表新增詞條。"
    meta["split_rule_zh_tw"] = (
        "原表中以斜線或括號表示的複合詞條拆成獨立單字，例如 gray/grey→gray、grey；pay(ment)→pay、payment；"
        "argue(argument)→argue、argument；I (me, my, mine, myself)→I、me、my、mine、myself。"
        "拆出的單字各自複製 definition、category、scenario、level、list、parts_of_speech、explains；"
        "examples 依句中出現的字形分配，未出現任何字形者歸第一字形，分不到例句的字形複製全部例句。"
        "拆出後與既有單字同名（大小寫視為不同）即合併，保留最小原 id。"
    )
    meta["cefr_rule_zh_tw"] = (
        "cefr 分級整合 7,000 實用單字清單、Oxford 3000/5000 與 CEFR-J 1.5 / Octanove。"
        "單字在多個來源中有不同分級時，一律採選項 A 取最低／最基礎級別（A1 < A2 < B1 < B2 < C1 < C2）；"
        "支援基礎屈折字形比對（如複數轉單數）；所有來源皆未收錄者維持 null。"
    )
    meta["new_entry_rule_zh_tw"] = (
        "7,000 字表中無法對應的單字新增為詞條：level、list 為 null，category、explains 為空陣列，"
        "topic 去重後放入 scenario，同字多筆的 definition 以「；」去重合併，例句去重保留。"
    )
    meta["guid_rule_zh_tw"] = (
        f"guid 為 UUID v5，命名空間 {GUID_NAMESPACE}；單字以 word、例句以 word＋en＋zh、"
        "explain 以 word＋en 計算，內容不變則重跑結果相同，可作為音檔檔名。"
    )

    def count(key_fn):
        c = Counter(key_fn(e) for e in entries)
        return {("null" if k is None else str(k)): v for k, v in sorted(c.items(), key=lambda kv: (kv[0] is None, str(kv[0])))}

    stats = {
        "total_entries": len(entries),
        "original_entries": len(original_entries),
        "original_entries_split": len(report["split_entries"]),
        "entries_from_split_forms": sum(1 for e in entries if max_original_id < e["id"] and e["word"] not in report["new_from_batch"]),
        "entries_new_from_7000_list": len(report["new_from_batch"]),
        "merged_duplicate_forms": len(report["collisions"]),
        "entries_by_list": count(lambda e: e["list"]),
        "entries_by_level": count(lambda e: e["level"]),
        "entries_by_cefr": count(lambda e: e["cefr"]),
        "entries_without_definition": sum(1 for e in entries if not e["definition"]),
        "total_examples": sum(len(e["examples"]) for e in entries),
        "total_explains": sum(len(e["explains"]) for e in entries),
    }

    out = {"metadata": meta, "statistics": stats, "entries": entries}
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    write_report(args.report, report, stats)
    print(json.dumps(stats, ensure_ascii=False, indent=2))


def write_report(path, r, stats):
    lines = ["# 單字庫合併與 CEFR 分級整合報告", "", "## 統計", "", "```json",
             json.dumps(stats, ensure_ascii=False, indent=2), "```", ""]

    def section(title, rows, fmt):
        lines.append(f"## {title}（{len(rows)}）")
        lines.append("")
        lines.extend(f"- {fmt(x)}" for x in rows)
        lines.append("")

    section("拆分的原詞條", r["split_entries"], lambda x: f"`{x[0]}` → {', '.join(x[1])}")
    section("分不到例句、改複製全部例句的字形", r["fallback_examples"], lambda x: f"`{x[0]}` → {x[1]}")
    section("同名合併", r["collisions"], lambda x: f"`{x[0]}` ← {' ｜ '.join(x[1])}")
    section("合併後不再使用的原 id", r["dropped_ids"], str)
    section("既有詞條補入定義", r["batch_matched_def_filled"], str)
    section("7,000 字表新增詞條", r["new_from_batch"], str)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    main()
