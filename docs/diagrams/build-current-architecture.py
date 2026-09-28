"""Generate the current-state, self-contained project diagrams.

Inputs are a reviewed snapshot of migrations and Compose, not a database query.
Run after schema/topology changes and review the generated HTML before publishing.
"""

from html import escape
from pathlib import Path
import json


OUT = Path(__file__).parent
PAPER = "#f5f5f5"
INK = "#2d3142"
MUTED = "#4f5d75"
SOFT = "#7a8399"
ACCENT = "#eb6c36"
LINK = "#2e5aa8"


def node(name, x, y, subtitle="", kind="SERVICE", focal=False, width=188, height=72):
    stroke = ACCENT if focal else INK
    fill = "#fff3ed" if focal else "#ffffff"
    label = escape(name)
    sub = escape(subtitle)
    tag = escape(kind)
    name_size = 13 if all(ord(c) < 128 for c in name) else 12
    return f'''<g class="node"><rect x="{x}" y="{y}" width="{width}" height="{height}" rx="6" fill="{PAPER}"/>
<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="6" fill="{fill}" stroke="{stroke}"/>
<text x="{x+12}" y="{y+17}" class="tag">{tag}</text>
<text x="{x+12}" y="{y+39}" class="name" font-size="{name_size}">{label}</text>
<text x="{x+12}" y="{y+58}" class="sub">{sub}</text></g>'''


def path(x1, y1, x2, y2, color=MUTED, dashed=False, marker=True):
    dash = ' stroke-dasharray="5,4"' if dashed else ""
    arrow = f' marker-end="url(#{"arrow-link" if color == LINK else "arrow-accent" if color == ACCENT else "arrow"})"' if marker else ""
    if x1 == x2:
        d = f"M{x1},{y1} V{y2}"
    elif y1 == y2:
        d = f"M{x1},{y1} H{x2}"
    else:
        mid = (x1+x2)//2
        sy = 1 if y2 > y1 else -1
        sx = 1 if x2 > x1 else -1
        d = f"M{x1},{y1} H{mid-8*sx} Q{mid},{y1} {mid},{y1+8*sy} V{y2-8*sy} Q{mid},{y2} {mid+8*sx},{y2} H{x2}"
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.3"{dash}{arrow}/>'


def svg(slug, title, desc, width, height, shapes):
    return f'''<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="{slug}-title {slug}-desc">
<title id="{slug}-title">{escape(title)}</title>
<desc id="{slug}-desc">{escape(desc)}</desc>
<defs>
<marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="{MUTED}"/></marker>
<marker id="arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="{ACCENT}"/></marker>
<marker id="arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="{LINK}"/></marker>
</defs>
<rect width="100%" height="100%" fill="{PAPER}"/>
{shapes}
</svg>'''


def section(number, heading, summary, visual, rows=None, table_title="外鍵／關聯清單", columns=("來源欄位", "目標／說明")):
    table = ""
    if rows:
        body = "".join(f'<tr><td><code>{escape(a)}</code></td><td>{escape(b)}</td></tr>' for a, b in rows)
        table = f'<details><summary>展開{escape(table_title)}（{len(rows)} 筆）</summary><table><thead><tr><th>{escape(columns[0])}</th><th>{escape(columns[1])}</th></tr></thead><tbody>{body}</tbody></table></details>'
    return f'<section><div class="section-head"><span class="index">{number}</span><div><h2>{escape(heading)}</h2><p>{escape(summary)}</p></div></div><div class="canvas">{visual}</div>{table}</section>'


def page(slug, title, lead, body, footer):
    return f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;family=Noto+Serif+TC:wght@400&amp;family=Noto+Sans+TC:wght@400;500;600&amp;display=swap" rel="stylesheet">
<style>
:root{{--paper:{PAPER};--ink:{INK};--muted:{MUTED};--soft:{SOFT};--accent:{ACCENT};--link:{LINK}}}
*{{box-sizing:border-box}} html{{scroll-behavior:smooth}} body{{margin:0;background:var(--paper);color:var(--ink);font-family:'Geist','Noto Sans TC','PingFang TC',sans-serif;line-height:1.55}}
.wrap{{max-width:1260px;margin:auto;padding:44px 32px 76px}} .eyebrow{{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.17em;color:var(--muted);text-transform:uppercase}}
h1{{font-family:'Instrument Serif','Noto Serif TC',serif;font-size:clamp(31px,4vw,48px);font-weight:400;line-height:1.18;margin:10px 0 14px}} .lead{{max-width:920px;color:var(--muted);font-size:15px;margin:0 0 36px}}
.section-head{{display:flex;align-items:baseline;gap:16px;margin-top:56px;margin-bottom:18px}} .index{{font:12px 'Geist Mono',monospace;color:var(--accent)}} h2{{font-size:21px;font-weight:600;margin:0}} .section-head p{{margin:3px 0 0;color:var(--muted);font-size:13px}}
.canvas{{overflow-x:auto;border-top:1px solid rgba(45,49,66,.13);border-bottom:1px solid rgba(45,49,66,.13)}} svg{{display:block;width:100%;min-width:860px;height:auto}} svg .name{{font-family:'Geist','Noto Sans TC','PingFang TC',sans-serif;font-weight:600;fill:var(--ink)}} svg .sub,svg .tag{{font-family:'Geist Mono',monospace;fill:var(--muted);font-size:10px}} svg .tag{{font-size:8px;letter-spacing:.14em}} svg .group-label{{font:600 12px 'Geist','Noto Sans TC',sans-serif;fill:var(--muted)}}
details{{margin:18px 0 0;border:1px solid rgba(45,49,66,.13);background:#fff;border-radius:6px}} summary{{cursor:pointer;padding:12px 16px;font-size:13px;font-weight:600}} table{{border-collapse:collapse;width:100%;font-size:12px}} th,td{{text-align:left;vertical-align:top;padding:9px 14px;border-top:1px solid rgba(45,49,66,.1)}} th{{color:var(--muted);font-weight:500}} code{{font-family:'Geist Mono',monospace;font-size:11px}} .note{{font-size:13px;color:var(--muted);margin-top:16px}} .legend{{display:flex;flex-wrap:wrap;gap:20px;border-top:1px solid rgba(45,49,66,.13);padding-top:15px;margin-top:18px;font-size:12px;color:var(--muted)}} .swatch{{display:inline-block;width:16px;height:2px;margin:0 7px 3px 0;background:var(--muted)}} .swatch.accent{{background:var(--accent)}} .swatch.link{{background:var(--link)}} footer{{border-top:1px solid rgba(45,49,66,.13);margin-top:64px;padding-top:18px;color:var(--muted);font:11px/1.7 'Geist Mono','Noto Sans TC',monospace}}
.physical-intro{{border-top:2px solid var(--ink);margin-top:72px;padding-top:26px}} .physical-intro h2{{font-family:'Instrument Serif','Noto Serif TC',serif;font-size:30px;font-weight:400}} .physical-intro p{{max-width:930px;color:var(--muted);font-size:14px}}
svg .schema-col{{font:12px 'Geist',sans-serif;fill:var(--ink)}} svg .schema-type{{font:9px 'Geist Mono',monospace;fill:var(--muted)}} svg .schema-flag{{font:8px 'Geist Mono',monospace;fill:var(--accent)}}
.table-detail-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}} .table-detail-grid details{{margin:0}} .table-detail summary{{display:flex;justify-content:space-between;gap:12px;align-items:center}} .table-detail summary span{{font-size:11px;color:var(--muted);font-weight:400}} .table-detail .table-scroll{{overflow-x:auto}} .table-detail h4{{font-size:12px;margin:16px 16px 6px}} .schema-list{{margin:0 16px 16px;padding-left:20px;color:var(--muted);font-size:11px;overflow-wrap:anywhere}} .schema-list li{{margin:5px 0}} .schema-list code{{font-size:10px}}
@media(max-width:700px){{.wrap{{padding:28px 18px 52px}}.section-head{{margin-top:42px}}}}
@media(max-width:900px){{.table-detail-grid{{grid-template-columns:1fr}}}}
</style></head><body><main class="wrap"><div class="eyebrow">EnglishLearning / current state / {escape(slug)}</div><h1>{escape(title)}</h1><p class="lead">{escape(lead)}</p>{body}<footer>{footer}</footer></main></body></html>'''


def er_visual(slug, title, desc, nodes, edges, width=1120, height=420):
    parts = []
    for e in edges:
        parts.append(path(*e, marker=False))
    for item in nodes:
        parts.append(node(*item))
    parts.append(f'<line x1="32" y1="{height-48}" x2="{width-32}" y2="{height-48}" stroke="rgba(45,49,66,.12)"/>')
    parts.append(f'<text x="32" y="{height-25}" class="sub">線條為主要 FK 走向；完整 FK、複合 FK 與無 FK 的邏輯關聯見下方清單</text>')
    return svg(slug, title, desc, width, height, "\n".join(parts))


core_rows = [
    ("categories.parent_id", "categories.id（自我參照，刪除母分類會連帶刪子分類）"),
    ("articles.category_id", "categories.id；ON DELETE SET NULL"),
    ("articles.created_by", "users.id"),
    ("paragraphs.article_id", "articles.id；ON DELETE CASCADE"),
    ("jobs.article_id", "articles.id；ON DELETE CASCADE"),
    ("jobs.paragraph_id", "paragraphs.id；ON DELETE CASCADE"),
    ("article_tags.article_id", "articles.id；複合主鍵一部分"),
    ("article_tags.tag_id", "tags.id；複合主鍵一部分"),
]
core = er_visual("er-core", "教材、分類與處理工作", "users、categories、articles、paragraphs、jobs、tags 和 article_tags 的主要外鍵關係。", [
    ("users",64,68,"id · email · role","TABLE",False),
    ("categories",352,68,"id · parent_id","TABLE",False),
    ("tags",640,68,"id · kind · label","TABLE",False),
    ("articles",352,188,"id · category_id · created_by","TABLE",True),
    ("paragraphs",640,188,"id · article_id · idx","TABLE",False),
    ("article_tags",928,188,"article_id · tag_id","JOIN",False,160),
    ("jobs",640,300,"article_id · paragraph_id","TABLE",False),
], [
    (158,140,352,224),(446,140,446,188),(540,224,640,224),(734,140,1008,188),
    (828,224,928,224),(734,260,734,300),(540,240,640,324),
])

vocab_rows = [
    ("word_explanations.word_id", "words.id；同字可有多篇語境解釋"),
    ("word_explanations.article_id", "articles.id"),
    ("word_explanations.paragraph_id", "paragraphs.id；可為 NULL"),
    ("vocabulary_items.user_id", "users.id；UNIQUE(user_id, word)"),
    ("vocabulary_sources.item_id", "vocabulary_items.id；ON DELETE CASCADE"),
    ("vocabulary_sources.article_id", "articles.id；文章刪除時 SET NULL，保留來源快照"),
    ("vocabulary_sources.paragraph_id", "paragraphs.id；段落刪除時 SET NULL，保留來源快照"),
    ("vocabulary_items.word → words.normalized_word", "文字對應，沒有資料庫 FK；不可當作實線外鍵"),
]
vocab = er_visual("er-vocab", "共用單字與個人收藏", "words 和 word_explanations 保存共用內容；vocabulary_items 與 vocabulary_sources 保存主動收藏及來源快照。", [
    ("users",64,64,"id · role","REF",False),
    ("words",352,64,"id · normalized_word","TABLE",False),
    ("articles",640,64,"id · title","REF",False),
    ("paragraphs",928,64,"id · article_id","REF",False,160),
    ("vocabulary_items",64,224,"user_id · word · status","TABLE",True),
    ("word_explanations",352,224,"word_id · article_id","TABLE",False),
    ("vocabulary_sources",640,224,"item_id · source snapshot","TABLE",False),
], [
    (158,136,158,224),(446,136,446,224),
    (828,100,928,100),(734,136,734,224),(928,116,828,248),
], height=388)

visual_rows = [
    ("illustration_estimates.article_id / created_by", "articles.id / users.id"),
    ("illustration_estimates.consumed_by_run_id", "article_visual_runs.id；估價與版本間的反向 FK"),
    ("article_visual_runs.article_id / created_by", "articles.id / users.id"),
    ("article_visual_runs.parent_run_id", "article_visual_runs.id（自我參照）"),
    ("article_visual_runs.estimate_id", "illustration_estimates.id；與 consumed_by_run_id 形成雙向 FK"),
    ("article_visual_publications.article_id", "articles.id；同時為 PK"),
    ("article_visual_publications.(article_id,run_id)", "article_visual_runs.(article_id,id)；複合 FK 保證發布版本屬同篇"),
    ("illustration_slots.run_id / paragraph_id", "article_visual_runs.id / paragraphs.id"),
    ("illustration_slots.(id,selected_candidate_id)", "illustration_candidates.(slot_id,id)；可延遲複合 FK"),
    ("illustration_candidates.slot_id", "illustration_slots.id；候選圖歸屬"),
    ("illustration_candidates.derived_from_candidate_id", "illustration_candidates.id（自我參照）"),
    ("illustration_candidates.reviewed_by", "users.id"),
]
visual = er_visual("er-visual", "插圖版本、槽位與候選圖", "文章可有多個視覺版本，發布指標選定版本；每個槽位可有多張候選圖。", [
    ("articles",64,68,"id · title","REF",False),
    ("illustration_estimates",352,68,"id · consumed_by_run_id","TABLE",False),
    ("article_visual_publications",760,68,"article_id · run_id","TABLE",False,280),
    ("article_visual_runs",352,196,"id · article_id · revision","TABLE",True),
    ("illustration_slots",640,196,"id · run_id · paragraph_id","TABLE",False),
    ("illustration_candidates",928,196,"id · slot_id · asset_id","TABLE",False,160),
    ("paragraphs",640,308,"id · article_id","REF",False),
], [
    (252,104,352,232),(446,140,446,196),(540,232,640,232),
    (828,232,928,232),(734,268,734,308),(540,212,760,104),
], height=420)

ops_rows = [
    ("illustration_asset_files.asset_id", "illustration_assets.id；一份資產可有多個檔案變體"),
    ("illustration_candidates.asset_id", "illustration_assets.id；候選圖可引用資產"),
    ("illustration_jobs.run_id / slot_id / candidate_id", "article_visual_runs.id / illustration_slots.id / illustration_candidates.id"),
    ("illustration_attempts.run_id / job_id / candidate_id", "article_visual_runs.id / illustration_jobs.id / illustration_candidates.id"),
    ("illustration_audit_events.run_id / actor_user_id", "article_visual_runs.id / users.id"),
    ("illustration_audit_events.slot_id / candidate_id", "保留識別值，沒有資料庫 FK"),
    ("illustration_cleanup_jobs.object_key", "待刪檔路徑，沒有指向 illustration_asset_files 的 FK"),
    ("image_worker_heartbeats", "獨立狀態表，沒有 FK"),
]
ops = er_visual("er-ops", "插圖資產、工作與稽核", "圖片資產和工作紀錄透過版本、槽位與候選圖相連；清理和心跳表獨立。", [
    ("article_visual_runs",48,64,"id · article_id","REF",False),
    ("illustration_slots",328,64,"id · run_id","REF",False),
    ("illustration_candidates",608,64,"id · slot_id","REF",False),
    ("illustration_assets",888,64,"id · metadata","TABLE",False),
    ("illustration_jobs",328,192,"id · run_id · slot_id","TABLE",True),
    ("illustration_attempts",608,192,"id · job_id","TABLE",False),
    ("illustration_asset_files",888,192,"asset_id · object_key","TABLE",False),
], [
    (236,100,328,228),(422,136,422,192),(516,228,608,228),
    (702,136,702,192),(796,100,888,100),(982,136,982,192),
], height=348)

aux_rows = [
    ("generation_settings", "單筆設定表；settings JSONB、version；沒有 FK"),
    ("illustration_audit_events.run_id / actor_user_id", "article_visual_runs.id / users.id"),
    ("image_worker_heartbeats", "圖片 worker 心跳表，沒有 FK"),
    ("illustration_cleanup_jobs", "待清理 object_key 佇列，沒有 FK"),
]
aux = er_visual("er-aux", "設定與維護表", "設定、稽核、圖片 worker 心跳和檔案清理工作表的外鍵狀態。", [
    ("generation_settings",72,84,"id=1 · settings · version","TABLE",False,224),
    ("illustration_audit_events",344,84,"run_id · actor_user_id","TABLE",False,224),
    ("image_worker_heartbeats",616,84,"id · seen_at","TABLE",False,224),
    ("illustration_cleanup_jobs",888,84,"object_key · attempts","TABLE",False,224),
], [], height=236)


CATALOG = json.loads((OUT / "schema-catalog.json").read_text(encoding="utf-8"))
TABLES = {table["name"]: table for table in CATALOG["tables"]}
SCHEMA_GROUPS = [
    ("身分、分類與標籤", ["users", "categories", "tags", "article_tags", "generation_settings"],
     [("article_tags", "tag_id", "tags", "id", "CASCADE")]),
    ("文章與處理工作", ["articles", "paragraphs", "jobs"],
     [("paragraphs", "article_id", "articles", "id", "CASCADE")]),
    ("單字與收藏", ["words", "word_explanations", "vocabulary_items", "vocabulary_sources"],
     [("word_explanations", "word_id", "words", "id", "CASCADE"),
      ("vocabulary_sources", "item_id", "vocabulary_items", "id", "CASCADE")]),
    ("插圖版本與發布", ["illustration_estimates", "article_visual_runs", "article_visual_publications", "illustration_slots"],
     [("article_visual_runs", "estimate_id", "illustration_estimates", "id", "SET NULL")]),
    ("圖片候選與資產", ["illustration_candidates", "illustration_assets", "illustration_asset_files"],
     [("illustration_candidates", "asset_id", "illustration_assets", "id", "NO ACTION")]),
    ("圖片工作與維護", ["illustration_jobs", "illustration_attempts", "illustration_audit_events", "image_worker_heartbeats", "illustration_cleanup_jobs"],
     [("illustration_attempts", "job_id", "illustration_jobs", "id", "CASCADE")]),
]


def column_flags(table, column_name):
    flags = []
    for constraint in table["constraints"]:
        if column_name in constraint["columns"]:
            flag = {"p": "PK", "f": "FK", "u": "UQ"}.get(constraint["kind"])
            if flag and flag not in flags:
                flags.append(flag)
    return flags


def display_columns(table):
    keyed = [column for column in table["columns"] if any(
        flag in ("PK", "FK") for flag in column_flags(table, column["name"]))]
    rest = [column for column in table["columns"] if column not in keyed]
    return (keyed + rest)[:8]


def schema_card(table, x, y, width=456):
    shown = display_columns(table)
    overflow = len(table["columns"]) - len(shown)
    height = 44 + len(shown) * 24 + (24 if overflow else 0)
    result = [f'<g class="schema-table"><rect x="{x}" y="{y}" width="{width}" height="{height}" rx="6" fill="{PAPER}"/>',
              f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="6" fill="#ffffff" stroke="{INK}"/>',
              f'<rect x="{x}" y="{y}" width="{width}" height="44" rx="6" fill="rgba(45,49,66,.05)"/>',
              f'<rect x="{x}" y="{y+38}" width="{width}" height="6" fill="rgba(45,49,66,.05)"/>',
              f'<line x1="{x}" y1="{y+44}" x2="{x+width}" y2="{y+44}" stroke="rgba(45,49,66,.24)"/>',
              f'<text x="{x+12}" y="{y+17}" class="tag">PUBLIC · TABLE</text>',
              f'<text x="{x+12}" y="{y+34}" class="name" font-size="12">{escape(table["name"])}</text>']
    for i, column in enumerate(shown):
        row_y = y + 44 + i * 24
        if i % 2:
            result.append(f'<rect x="{x+1}" y="{row_y}" width="{width-2}" height="24" fill="rgba(45,49,66,.025)"/>')
        flags = column_flags(table, column["name"])
        if column["not_null"] and "PK" not in flags:
            flags.append("NN")
        flag_text = " ".join(flags)
        result.append(f'<text x="{x+12}" y="{row_y+16}" class="schema-col">{escape(column["name"])}</text>')
        result.append(f'<text x="{x+width-114}" y="{row_y+16}" class="schema-flag">{escape(flag_text)}</text>')
        visual_type = {"timestamp with time zone": "timestamptz", "timestamp without time zone": "timestamp"}.get(column["type"], column["type"])
        result.append(f'<text x="{x+width-12}" y="{row_y+16}" class="schema-type" text-anchor="end">{escape(visual_type)}</text>')
    if overflow:
        result.append(f'<text x="{x+12}" y="{y+height-8}" class="schema-type">+ {overflow} 個欄位；下方可展開完整 schema</text>')
    return "\n".join(result) + "</g>", shown


def schema_visual(number, heading, names, links):
    positions = {name: (48 + i % 2 * 608, 56 + i // 2 * 296) for i, name in enumerate(names)}
    shown = {name: display_columns(TABLES[name]) for name in names}
    rows = (len(names) + 1) // 2
    height = 56 + rows * 296 + 28
    shapes = []
    for source, source_col, target, target_col, action in links:
        sx, sy = positions[source]
        tx, ty = positions[target]
        si = next(i for i, column in enumerate(shown[source]) if column["name"] == source_col)
        ti = next(i for i, column in enumerate(shown[target]) if column["name"] == target_col)
        y1 = sy + 44 + si * 24 + 12
        y2 = ty + 44 + ti * 24 + 12
        x1 = sx if sx > tx else sx + 456
        x2 = tx + 456 if sx > tx else tx
        shapes.append(path(x1, y1, x2, y2, color=ACCENT if action == "CASCADE" else MUTED))
        lx = (x1+x2)//2 + 10
        ly = (y1+y2)//2
        shapes.append(f'<rect x="{lx}" y="{ly-16}" width="64" height="12" rx="2" fill="{PAPER}"/>')
        shapes.append(f'<text x="{lx+2}" y="{ly-7}" class="schema-type">{escape(action)}</text>')
    for name in names:
        x, y = positions[name]
        card, _ = schema_card(TABLES[name], x, y)
        shapes.append(card)
    shapes.append(f'<line x1="32" y1="{height-28}" x2="1128" y2="{height-28}" stroke="rgba(45,49,66,.12)"/>')
    return svg(f"physical-{number}", heading,
               f"{heading}的實體資料表欄位、SQL 型別與主要欄位層級外鍵；完整欄位與約束見下方展開區。",
               1160, height, "\n".join(shapes))


def table_detail(table):
    rows = []
    for column in table["columns"]:
        flags = column_flags(table, column["name"])
        if column["not_null"]:
            flags.append("NOT NULL")
        if column["identity"]:
            flags.append("IDENTITY")
        rows.append("<tr>" + "".join([
            f'<td><code>{escape(column["name"])}</code></td>',
            f'<td><code>{escape(column["type"])}</code></td>',
            f'<td>{escape(", ".join(flags))}</td>',
            f'<td><code>{escape(column["default"] or "—")}</code></td>',
        ]) + "</tr>")
    constraints = "".join(f'<li><code>{escape(item["name"])}</code> · {escape(item["definition"])}</li>' for item in table["constraints"])
    indexes = "".join(f'<li><code>{escape(item["name"])}</code> · <code>{escape(item["definition"])}</code></li>' for item in table["indexes"])
    triggers = "".join(f'<li><code>{escape(item["name"])}</code> · <code>{escape(item["definition"])}</code></li>' for item in table["triggers"])
    trigger_section = f'<h4>觸發器</h4><ul class="schema-list">{triggers}</ul>' if triggers else ""
    trigger_count = f" · {len(table['triggers'])} 觸發器" if triggers else ""
    return f'''<details class="table-detail" id="table-{escape(table["name"])}"><summary><code>{escape(table["name"])}</code><span>{len(table["columns"])} 欄 · {len(table["constraints"])} 約束 · {len(table["indexes"])} 索引{trigger_count}</span></summary>
<div class="table-scroll"><table><thead><tr><th>欄位</th><th>SQL 型別</th><th>鍵／非空</th><th>預設值</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>
<h4>約束</h4><ul class="schema-list">{constraints}</ul><h4>索引</h4><ul class="schema-list">{indexes}</ul>{trigger_section}</details>'''


def physical_schema_sections():
    sections = ['<div class="physical-intro"><h2>每張表的實體 schema</h2><p>從隔離測試庫套用所有 migrations 後擷取，共 24 張表、217 個欄位。圖中每表最多顯示 8 欄，優先保留 PK／FK；展開表名可查閱完整欄位、SQL 型別、預設值、CHECK、UNIQUE、外鍵動作及索引。</p></div>']
    for i, (heading, names, links) in enumerate(SCHEMA_GROUPS, 1):
        visual = schema_visual(i, heading, names, links)
        details = "".join(table_detail(TABLES[name]) for name in names)
        sections.append(section(f"S{i:02d}", heading, f"{len(names)} 張表；完整欄位及約束於圖下展開。", visual))
        sections.append(f'<div class="table-detail-grid">{details}</div>')
    enum_items = "".join(f'<li><code>{escape(item["name"])}</code>：{escape(", ".join(item["values"]))}</li>' for item in CATALOG["enums"])
    sections.append(f'<div class="note"><strong>Enum 型別</strong><ul>{enum_items}</ul>獨立擷取指令：<code>npm run test:db:up</code> → <code>node docs/diagrams/extract-schema-catalog.mjs</code> → <code>npm run test:db:down</code>。此流程僅使用名稱以 <code>_test</code> 結尾的測試庫。</div>')
    return "".join(sections)

er_body = "".join([
    section("01", "教材與分類", "7 張表；文章是段落、處理工作與標籤關聯的中心。", core, core_rows),
    section("02", "單字與收藏", "4 張本群組表；users、articles、paragraphs 在圖中重複作為參照。", vocab, vocab_rows),
    section("03", "插圖版本與內容", "版本、發布指標、槽位、候選圖與估價；跨圖表以 REF 標示。", visual, visual_rows),
    section("04", "插圖資產與工作", "候選圖引用資產；工作與嘗試紀錄引用版本／槽位／候選圖。", ops, ops_rows),
    section("05", "設定與維護", "列出沒有 FK 的獨立表，並補足稽核事件的實際外鍵。", aux, aux_rows),
    '<p class="note">共 24 張相異應用資料表。標為 REF 的卡片是跨群組重複出現的表，不另計入總數。圖中直線／折線僅呈現主要關係；展開每節清單可核對全部實際 FK 與明確沒有 FK 的文字關聯。資料庫 migration 紀錄表不計入。</p>',
])
er_body += physical_schema_sections()
(OUT / "current-data-model.html").write_text(page("data-model", "目前資料模型", "以 migrations 中的 Up 結構整理；這是程式庫 schema 現況，不代表尚未部署的 migration 已套入正式資料庫。", er_body, "來源：migrations/1782740846925_init-schema.sql、1788652800000_article-illustrations.sql、1789862400000_vocabulary-review.sql、1789862400001_generation-settings.sql、1789862400004–0006。盤點日期：2026-09-27。"), encoding="utf-8")


dp_main = svg("dp-runtime", "Docker 服務執行期整合", "瀏覽器或選用 Tunnel 經 proxy 進入兩個前端及 API；API、文章 worker、圖片 worker 共用 PostgreSQL，worker 使用外部生成服務。", 1200, 576, "\n".join([
    '<rect x="282" y="52" width="728" height="444" rx="8" fill="rgba(45,49,66,.02)" stroke="rgba(45,49,66,.16)"/>',
    '<rect x="298" y="46" width="116" height="18" fill="#f5f5f5"/><text x="302" y="59" class="tag">COMPOSE RUNTIME</text>',
    path(236,144,316,144,color=LINK), path(236,324,316,164,color=LINK,dashed=True),
    path(504,144,600,112,color=LINK), path(504,156,600,232,color=LINK),
    path(788,112,860,224,color=LINK), path(788,232,860,244,color=LINK),
    path(954,280,954,372),path(788,352,860,408),path(788,440,860,428),
    node("瀏覽器",48,108,"localhost:8090","CLIENT",False),
    node("cloudflared",48,288,"tunnel profile","OPTIONAL",False),
    node("proxy",316,108,"nginx · :8090 → :80","INGRESS",True),
    node("web-admin",600,76,"/admin/ · :8081","SPA",False),
    node("web-learner",600,196,"/ · :8082","SPA",False),
    node("api",860,208,"Fastify · :8080","API",True),
    node("worker",600,316,"article jobs","WORKER",False),
    node("image-worker",600,404,"images profile","OPTIONAL",False),
    node("db",860,372,"PostgreSQL · :5432","STORE",False),
    '<line x1="36" y1="524" x2="1164" y2="524" stroke="rgba(45,49,66,.12)"/>',
    '<text x="40" y="548" class="sub">藍線：HTTP 入口　灰線：DB 存取　虛線：選用 profile；線條表示執行期連線，不表示 depends_on 啟動順序</text>',
]))

dp_storage = svg("dp-storage", "一次性服務與資料儲存", "migrate 和 seed 是一次性服務；文章 worker 掛載 audio，圖片 worker 掛載 images，API 掛載 audio 與唯讀 images。", 1200, 520, "\n".join([
    path(236,112,448,112),path(848,112,636,112),
    path(142,292,142,352),path(448,256,236,388),path(942,292,942,352),
    node("migrate",48,76,"schema · run once","JOB",False),
    node("db",448,76,"pgdata volume","STORE",True),
    node("seed",848,76,"fixtures · seed profile","OPTIONAL",False),
    node("api",48,220,"audio 寫 · images 唯讀","SERVICE",False),
    node("worker",448,220,"audio 寫 · jobs 輪詢","SERVICE",False),
    node("image-worker",848,220,"images 寫 · jobs 輪詢","OPTIONAL",False),
    node("audio volume",48,352,"api · worker · seed","VOLUME",False),
    node("Vertex AI / OpenAI",448,352,"api / workers 依設定呼叫","EXTERNAL",False),
    node("images volume",848,352,"image-worker 寫；api 唯讀","VOLUME",False),
    '<line x1="36" y1="464" x2="1164" y2="464" stroke="rgba(45,49,66,.12)"/>',
    '<text x="40" y="489" class="sub">測試專用另有 db-test / migrate-test：獨立 Compose project、5433、tmpfs；不連正式堆疊</text>',
]))

dp_inventory = [
    ("db", "預設；PostgreSQL 16，主機 127.0.0.1:5432，pgdata"),
    ("migrate", "預設；一次性 schema migration；等待 db healthy"),
    ("api", "預設；Fastify :8080；DB、audio、images 唯讀、供應商"),
    ("worker", "預設；文章 jobs；DB、audio、供應商"),
    ("image-worker", "images profile；圖片 jobs；DB、images、供應商；deploy.sh 預設啟用"),
    ("web-admin", "預設；Nginx 靜態 SPA，主機 :8081；API 請求由反向代理轉發"),
    ("web-learner", "預設；Nginx 靜態 SPA，主機 :8082；API 請求由反向代理轉發"),
    ("proxy", "預設；Nginx 主入口 :8090，依路徑分流"),
    ("cloudflared", "tunnel profile；連到 proxy:80"),
    ("seed", "seed profile；一次性示範資料匯入，會寫 DB 與 audio"),
]
dp_body = section("01", "執行期連線", "主入口和常駐服務；images、tunnel 以選用 profile 標明。", dp_main) + section("02", "初始化、持久化與外部供應商", "migrate 與 seed 為一次性服務；三個 named volume 和測試隔離堆疊另列。", dp_storage, dp_inventory, "服務清單", ("服務", "啟動與連線"))
dp_body += '<p class="note">SPA 的 API 請求由瀏覽器執行，經 proxy（或直連前端 Nginx）反向代理至 api；圖中的 web→api 線表示前端程式的同源 fetch。seed 使用 fixtures，不呼叫 AI 供應商。</p>'
(OUT / "current-docker-integration.html").write_text(page("dp-integration", "Docker 服務整合", "依 docker-compose.yml、proxy/nginx.conf 與服務入口整理。Compose 的 depends_on 控制啟動順序，圖中箭頭表示執行期資料或請求方向。", dp_body, "來源：docker-compose.yml、docker-compose.test.yml、proxy/nginx.conf、web-admin/nginx.conf、web-learner/nginx.conf、scripts/deploy.sh。盤點日期：2026-09-27。"), encoding="utf-8")


architecture = svg("architecture-main", "程式碼主體架構", "瀏覽器透過 proxy 取得兩個 React 前端；兩個前端呼叫 Fastify API；API 與兩個獨立 worker 共用 shared 模組、PostgreSQL 和生成供應商。", 1200, 608, "\n".join([
    '<rect x="300" y="48" width="692" height="472" rx="8" fill="rgba(45,49,66,.02)" stroke="rgba(45,49,66,.16)"/>',
    '<rect x="316" y="42" width="124" height="18" fill="#f5f5f5"/><text x="320" y="55" class="tag">APPLICATION CODE</text>',
    path(240,124,332,124,color=LINK),
    path(520,124,612,124,color=LINK),path(520,136,612,236,color=LINK),
    path(800,124,884,236,color=LINK),path(800,236,884,256,color=LINK),
    path(800,368,884,448),path(800,468,884,468),
    path(978,292,978,412),
    path(540,352,612,368,dashed=True),path(540,388,612,468,dashed=True),
    node("瀏覽器",52,88,"單一使用者介面","CLIENT",False),
    node("Nginx proxy",332,88,"/admin · API · /","ROUTER",True),
    node("web-admin",612,88,"React / Vite","FRONTEND",False),
    node("web-learner",612,200,"React / Vite","FRONTEND",False),
    node("Fastify API",884,220,"auth · routes · HTTP","BACKEND",True),
    node("文章 worker",612,332,"翻譯 · 中英 TTS","PROCESS",False),
    node("圖片 worker",612,432,"規劃 · 生圖 · 審核資料","PROCESS",False),
    node("@el/shared",332,316,"repo · 契約 · 生成 client","LIBRARY",False,208),
    node("PostgreSQL",884,412,"文章 / 單字 / 圖片 / 設定","DATA",False),
    '<line x1="36" y1="550" x2="1164" y2="550" stroke="rgba(45,49,66,.12)"/>',
    '<text x="40" y="575" class="sub">共用模組由後端行程直接載入；瀏覽器沒有直接 import @el/shared。音檔與圖片位於 Docker volumes。</text>',
]))
arch_body = section("01", "主路徑與程式邊界", "九個主節點：前端、HTTP 邊界、共用程式庫、兩種獨立 worker 與資料層。", architecture)
arch_body += '<div class="legend"><span><i class="swatch link"></i>HTTP / 反向代理</span><span><i class="swatch"></i>資料庫與內部處理</span><span><i class="swatch accent"></i>主要整合點</span><span>虛線：程式庫依賴</span></div>'
arch_body += '<p class="note">API 以 Cloudflare Access JWT 或開發模式 bypass 驗證；角色權限在 API 的 auth／route 層執行。文章 worker 輪詢 article jobs；圖片 worker 從獨立入口輪詢 illustration jobs。文字、語音與圖片供應商由資料庫 generation_settings 決定。migrate 是一次性 schema 服務；Cloudflare Tunnel 是選用外部入口。最新插圖 migrations 仍屬程式碼現況，尚未據此確認正式部署。</p>'
(OUT / "current-code-architecture.html").write_text(page("architecture", "程式碼主體架構", "從實際入口、路由、shared 模組與 worker 行程整理。圖上的箭頭描述程式與請求關係；外部 AI 供應商、volumes 和一次性 migration 在文字中註明。", arch_body, "來源：api/src/server.ts、api/src/app.ts、api/src/auth.ts、worker/src/index.ts、worker/src/image-index.ts、shared/src/index.ts、web-admin/src/api.ts、web-learner/src/api.ts、proxy/nginx.conf、docker-compose.yml。盤點日期：2026-09-27。"), encoding="utf-8")
