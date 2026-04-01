#!/usr/bin/env python3
"""
PHASE 0: ChatGPT Export Parser & Conversion Triage Prep
========================================================
Parses a ChatGPT data export (zip or extracted), splits conversations
by project, generates a manifest with metadata, and prepares cluster
files for downstream extraction by Claude.

USAGE:
  python phase0_parse_export.py /path/to/chatgpt_export.zip
  python phase0_parse_export.py /path/to/extracted_folder/

OUTPUT:
  ./excavation_output/
    manifest.json          — Full index of all conversations
    manifest_summary.txt   — Human-readable overview
    projects/
      project_name/
        conversations.json — All conversations in that project
        index.txt          — Per-project summary
    untagged/
      conversations.json   — Conversations not assigned to a project
      index.txt
    chunks/
      project_name_chunk_001.json  — Chunked files (max ~80K tokens each)
"""

import json
import sys
import os
import zipfile
import shutil
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import re

# ─── Configuration ───────────────────────────────────────────────
MAX_TOKENS_PER_CHUNK = 80000  # ~80K tokens per chunk for Cowork sessions
CHARS_PER_TOKEN = 4  # rough estimate
MAX_CHARS_PER_CHUNK = MAX_TOKENS_PER_CHUNK * CHARS_PER_TOKEN
OUTPUT_DIR = Path("./excavation_output")

# ─── Priority projects for PolicyLM excavation ───────────────────
POLICYLM_CLUSTER = [
    "policylm", "policy lm", "oraclevm", "oracle vm", 
    "relatomik", "relatome", "relatomes", "relatomic",
    "digital twin", "digital twins",
    "compliance router", "compliance engine", "compliance ai",
    "auto-encoding relato", "dt vendors",
    "policy compliance", "regulatory ai", "regtech",
    "institutional decision", "policy engine",
]

CREATIVE_CLUSTER = [
    "man who asked", "screenplay", "comic book", "comic",
    "graphic novel", "graphic novella", "novella",
    "talks with greats", "gem helper",
    "beat sheet", "visual identity", "storyboard",
    "philosophical comic", "pcb",
]

PROMPTING_CLUSTER = [
    "filament", "dramaturgical", "optimize ai prompt",
    "tailormadelm", "tailormade lm", "tailored lm",
    "prompting technique", "prompt engineering",
    "boss prompting", "prompt optim",
]

CAREER_CLUSTER = [
    "ai investment fund", "ai developer role", "paid ai work",
    "employment", "ben gurion ai dev", "career",
    "job search", "job application", "linkedin",
    "resume", "cv ", "bootcamp", "midterm exercise",
    "interview", "salary", "hiring",
]

PHILOSOPHY_CLUSTER = [
    "philosophy", "political theory", "prestige and truth",
    "republic of letters", "third arena", "ai and ethics",
    "ai consequences", "jungian", "psychoanalyst",
    "mercurius", "epistemolog", "ontolog",
    "phenomeno", "heidegger", "deleuze", "foucault",
    "political life", "vertical slice",
]


def extract_zip(zip_path: str) -> Path:
    """Extract zip to temp directory, return path to extracted content."""
    extract_dir = Path("./chatgpt_extracted")
    if extract_dir.exists():
        print(f"  Using existing extraction at {extract_dir}")
        return extract_dir
    print(f"  Extracting {zip_path}...")
    with zipfile.ZipFile(zip_path, 'r') as zf:
        zf.extractall(extract_dir)
    print(f"  Extracted to {extract_dir}")
    return extract_dir


def find_conversations_files(base_path: Path) -> list:
    """Locate all conversations JSON files in the export.
    ChatGPT exports split conversations across multiple files:
    conversations-000.json, conversations-001.json, etc.
    Also handles the older single-file format (conversations.json).
    """
    # Look for split files first (newer format)
    candidates = sorted(base_path.rglob("conversations-*.json"))
    if candidates:
        total_size = sum(p.stat().st_size for p in candidates)
        print(f"  Found {len(candidates)} conversation files ({total_size / 1e6:.1f} MB total)")
        return candidates
    
    # Fall back to single file (older format)
    candidates = list(base_path.rglob("conversations.json"))
    if candidates:
        largest = max(candidates, key=lambda p: p.stat().st_size)
        print(f"  Found conversations file: {largest} ({largest.stat().st_size / 1e6:.1f} MB)")
        return [largest]
    
    raise FileNotFoundError("No conversations JSON files found in export")


def estimate_tokens(text: str) -> int:
    """Rough token estimate."""
    return len(text) // CHARS_PER_TOKEN


def extract_conversation_text(convo: dict) -> str:
    """Extract all message text from a conversation."""
    texts = []
    mapping = convo.get("mapping", {})
    
    # Build ordered message list
    messages = []
    for node_id, node in mapping.items():
        msg = node.get("message")
        if msg and msg.get("content") and msg["content"].get("parts"):
            role = msg.get("author", {}).get("role", "unknown")
            timestamp = msg.get("create_time")
            parts = msg["content"]["parts"]
            text_parts = [p for p in parts if isinstance(p, str) and p.strip()]
            if text_parts:
                messages.append({
                    "role": role,
                    "timestamp": timestamp or 0,
                    "text": "\n".join(text_parts)
                })
    
    # Sort by timestamp
    messages.sort(key=lambda m: m["timestamp"])
    
    for msg in messages:
        role_label = msg["role"].upper()
        texts.append(f"[{role_label}]: {msg['text']}")
    
    return "\n\n".join(texts)


def classify_project(title: str, project_tag: str, content_sample: str = "") -> dict:
    """Classify conversation into thematic clusters for priority routing.
    Scans title, project tag, AND first ~2000 chars of conversation content.
    """
    title_lower = (title or "").lower()
    tag_lower = (project_tag or "").lower()
    content_lower = (content_sample or "")[:2000].lower()
    combined = f"{title_lower} {tag_lower} {content_lower}"
    
    clusters = []
    if any(k in combined for k in POLICYLM_CLUSTER):
        clusters.append("policylm")
    if any(k in combined for k in CREATIVE_CLUSTER):
        clusters.append("creative")
    if any(k in combined for k in PROMPTING_CLUSTER):
        clusters.append("prompting")
    if any(k in combined for k in CAREER_CLUSTER):
        clusters.append("career")
    if any(k in combined for k in PHILOSOPHY_CLUSTER):
        clusters.append("philosophy")
    
    return clusters if clusters else ["other"]


def safe_dirname(name: str) -> str:
    """Convert a project name to a safe directory name."""
    safe = re.sub(r'[^\w\s-]', '', name or "untagged")
    safe = re.sub(r'\s+', '_', safe.strip())
    return safe[:80] or "untagged"


def process_export(source_path: str):
    """Main processing pipeline."""
    source = Path(source_path)
    
    # Step 1: Handle zip vs directory
    if source.suffix == '.zip':
        base_path = extract_zip(source_path)
    elif source.is_dir():
        base_path = source
    else:
        raise ValueError(f"Expected a .zip file or directory, got: {source}")
    
    # Step 2: Find and load conversations
    conv_files = find_conversations_files(base_path)
    print("  Loading conversations (this may take a moment for large exports)...")
    conversations = []
    for cf in conv_files:
        print(f"    Loading {cf.name}...")
        with open(cf, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                conversations.extend(data)
            else:
                conversations.append(data)
    print(f"  Loaded {len(conversations)} conversations from {len(conv_files)} files")
    
    # Step 3: Process each conversation
    manifest = []
    projects = defaultdict(list)
    
    for i, convo in enumerate(conversations):
        if i % 100 == 0 and i > 0:
            print(f"  Processing conversation {i}/{len(conversations)}...")
        
        title = convo.get("title", "Untitled")
        convo_id = convo.get("id", f"conv_{i}")
        create_time = convo.get("create_time")
        update_time = convo.get("update_time")
        
        # Get project tag if available (ChatGPT project metadata)
        # The field name may vary; check common locations
        project_tag = None
        if "project" in convo:
            project_tag = convo["project"]
            if isinstance(project_tag, dict):
                project_tag = project_tag.get("name") or project_tag.get("title")
        elif "folder" in convo:
            project_tag = convo["folder"]
        elif "gizmo_id" in convo:
            # Custom GPT conversations
            project_tag = f"CustomGPT:{convo.get('gizmo_id', 'unknown')[:20]}"
        
        # Extract full text
        full_text = extract_conversation_text(convo)
        token_count = estimate_tokens(full_text)
        word_count = len(full_text.split())
        
        # Get first 500 chars as preview
        preview = full_text[:500].replace('\n', ' ')
        
        # Classify into thematic clusters (scans title + first 2000 chars of content)
        clusters = classify_project(title, project_tag, full_text)
        
        # Date formatting
        date_str = ""
        if create_time:
            try:
                date_str = datetime.fromtimestamp(create_time).strftime("%Y-%m-%d")
            except:
                pass
        
        entry = {
            "id": convo_id,
            "title": title,
            "project": project_tag,
            "clusters": clusters,
            "date": date_str,
            "create_time": create_time,
            "update_time": update_time,
            "token_estimate": token_count,
            "word_count": word_count,
            "message_count": sum(1 for n in convo.get("mapping", {}).values() 
                               if n.get("message") and n["message"].get("content")),
            "preview": preview,
        }
        manifest.append(entry)
        
        # Group by project
        project_key = safe_dirname(project_tag) if project_tag else "untagged"
        projects[project_key].append({
            "meta": entry,
            "full_text": full_text,
        })
    
    # Step 4: Write output
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)
    
    # Write manifest
    manifest.sort(key=lambda x: x.get("update_time") or 0, reverse=True)
    with open(OUTPUT_DIR / "manifest.json", 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    # Write human-readable summary
    write_summary(manifest, projects)
    
    # Write project cluster files
    projects_dir = OUTPUT_DIR / "projects"
    projects_dir.mkdir()
    chunks_dir = OUTPUT_DIR / "chunks"
    chunks_dir.mkdir()
    
    total_chunks = 0
    for project_name, convos in projects.items():
        proj_dir = projects_dir / project_name
        proj_dir.mkdir(parents=True, exist_ok=True)
        
        # Write full project conversations
        project_data = []
        for c in convos:
            project_data.append({
                "title": c["meta"]["title"],
                "date": c["meta"]["date"],
                "clusters": c["meta"]["clusters"],
                "tokens": c["meta"]["token_estimate"],
                "text": c["full_text"],
            })
        
        # Sort by date
        project_data.sort(key=lambda x: x["date"])
        
        with open(proj_dir / "conversations.json", 'w', encoding='utf-8') as f:
            json.dump(project_data, f, indent=1, ensure_ascii=False)
        
        # Write project index
        with open(proj_dir / "index.txt", 'w', encoding='utf-8') as f:
            total_tokens = sum(c["meta"]["token_estimate"] for c in convos)
            f.write(f"Project: {project_name}\n")
            f.write(f"Conversations: {len(convos)}\n")
            f.write(f"Total tokens: {total_tokens:,}\n")
            f.write(f"Clusters: {set(c for conv in convos for c in conv['meta']['clusters'])}\n")
            f.write(f"\n{'='*60}\n\n")
            for c in sorted(convos, key=lambda x: x["meta"]["date"]):
                f.write(f"  [{c['meta']['date']}] {c['meta']['title']} ({c['meta']['token_estimate']:,} tokens)\n")
        
        # Create chunks for large projects
        chunk_num = 1
        current_chunk = []
        current_size = 0
        
        for item in project_data:
            item_size = len(item["text"])
            if current_size + item_size > MAX_CHARS_PER_CHUNK and current_chunk:
                # Write current chunk
                chunk_name = f"{project_name}_chunk_{chunk_num:03d}.json"
                with open(chunks_dir / chunk_name, 'w', encoding='utf-8') as f:
                    json.dump(current_chunk, f, indent=1, ensure_ascii=False)
                total_chunks += 1
                chunk_num += 1
                current_chunk = []
                current_size = 0
            
            current_chunk.append(item)
            current_size += item_size
        
        # Write final chunk
        if current_chunk:
            chunk_name = f"{project_name}_chunk_{chunk_num:03d}.json"
            with open(chunks_dir / chunk_name, 'w', encoding='utf-8') as f:
                json.dump(current_chunk, f, indent=1, ensure_ascii=False)
            total_chunks += 1
    
    # Step 5: Generate thematic cluster bundles (cross-project)
    write_thematic_bundles(manifest, projects)
    
    print(f"\n{'='*60}")
    print(f"EXCAVATION PREP COMPLETE")
    print(f"{'='*60}")
    print(f"  Conversations: {len(manifest)}")
    print(f"  Projects: {len(projects)}")
    print(f"  Chunks: {total_chunks}")
    print(f"  Output: {OUTPUT_DIR.absolute()}")
    print(f"\n  Next: Feed chunks to Cowork with extraction prompts")


def write_summary(manifest, projects):
    """Write human-readable manifest summary."""
    with open(OUTPUT_DIR / "manifest_summary.txt", 'w', encoding='utf-8') as f:
        total_tokens = sum(m["token_estimate"] for m in manifest)
        
        f.write("CHATGPT EXPORT — CONVERSION EXCAVATION MANIFEST\n")
        f.write(f"{'='*60}\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"Total conversations: {len(manifest)}\n")
        f.write(f"Total estimated tokens: {total_tokens:,}\n")
        f.write(f"Total projects: {len(projects)}\n")
        f.write(f"\n")
        
        # Cost estimates
        opus_input_cost = (total_tokens / 1_000_000) * 15
        sonnet_input_cost = (total_tokens / 1_000_000) * 3
        f.write("COST ESTIMATES (full corpus, single pass):\n")
        f.write(f"  Opus input:  ${opus_input_cost:.2f}\n")
        f.write(f"  Sonnet input: ${sonnet_input_cost:.2f}\n")
        f.write(f"  (Output costs add ~30-50% more)\n")
        f.write(f"\n")
        
        # Cluster breakdown
        cluster_stats = defaultdict(lambda: {"count": 0, "tokens": 0})
        for m in manifest:
            for c in m["clusters"]:
                cluster_stats[c]["count"] += 1
                cluster_stats[c]["tokens"] += m["token_estimate"]
        
        f.write("THEMATIC CLUSTERS:\n")
        for cluster, stats in sorted(cluster_stats.items(), key=lambda x: -x[1]["tokens"]):
            f.write(f"  {cluster:15s} — {stats['count']:3d} convos, {stats['tokens']:>10,} tokens\n")
        
        f.write(f"\n{'='*60}\n")
        f.write("TOP 30 CONVERSATIONS BY SIZE (likely richest content):\n\n")
        for m in sorted(manifest, key=lambda x: -x["token_estimate"])[:30]:
            f.write(f"  [{m['date']}] {m['title'][:50]:50s} {m['token_estimate']:>8,} tok  project={m['project'] or 'none'}\n")
        
        f.write(f"\n{'='*60}\n")
        f.write("PROJECTS BY SIZE:\n\n")
        for proj_name, convos in sorted(projects.items(), 
                                         key=lambda x: -sum(c["meta"]["token_estimate"] for c in x[1])):
            total = sum(c["meta"]["token_estimate"] for c in convos)
            f.write(f"  {proj_name[:40]:40s} {len(convos):3d} convos  {total:>10,} tokens\n")


def write_thematic_bundles(manifest, projects):
    """Create cross-project thematic bundles for targeted extraction."""
    bundles_dir = OUTPUT_DIR / "thematic_bundles"
    bundles_dir.mkdir()
    
    # Group all conversations by cluster
    cluster_convos = defaultdict(list)
    for proj_name, convos in projects.items():
        for c in convos:
            for cluster in c["meta"]["clusters"]:
                cluster_convos[cluster].append({
                    "project": proj_name,
                    "title": c["meta"]["title"],
                    "date": c["meta"]["date"],
                    "tokens": c["meta"]["token_estimate"],
                    "preview": c["meta"]["preview"],
                })
    
    for cluster_name, convos in cluster_convos.items():
        convos.sort(key=lambda x: x["date"])
        with open(bundles_dir / f"{cluster_name}_index.json", 'w', encoding='utf-8') as f:
            json.dump({
                "cluster": cluster_name,
                "total_conversations": len(convos),
                "total_tokens": sum(c["tokens"] for c in convos),
                "conversations": convos,
            }, f, indent=2, ensure_ascii=False)
    
    print(f"  Thematic bundles: {list(cluster_convos.keys())}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python phase0_parse_export.py /path/to/chatgpt_export.zip")
        sys.exit(1)
    
    process_export(sys.argv[1])
