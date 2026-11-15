"""Inline sprites.json into the template and emit the page bundle.

    python3 vendor/grok-bot-office/tools/build.py

The office is MIT licensed, Copyright (c) 2026 MyWestLord.
https://github.com/MyWestLord/grok-bot-office
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFFICE = HERE.parent
REPO = OFFICE.parents[1]
tpl = (OFFICE / "src" / "office.tpl.html").read_text()
spr = (OFFICE / "src" / "sprites.json").read_text()
html = tpl.replace("/*SPRITES*/", spr)
(OFFICE / "src" / "office.html").write_text(html)
out = REPO / "components" / "office-html.ts"
out.write_text("export const OFFICE_HTML: string = " + json.dumps(html) + ";\n")
print(f"src/office.html ({len(html) // 1024} kb)")
print(f"{out.relative_to(REPO)} ({out.stat().st_size // 1024} kb)")
