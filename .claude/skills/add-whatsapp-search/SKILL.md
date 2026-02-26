---
name: add-whatsapp-search
description: Add semantic search over WhatsApp message history. Uses Qdrant vector database with OpenAI embeddings to enable the container agent to search past conversations by meaning, not just keywords.
---

# Add WhatsApp Search

Adds a complete RAG (Retrieval-Augmented Generation) system for searching WhatsApp message history using semantic similarity.

**Architecture:**
- **Qdrant** vector database (Docker container) stores message embeddings
- **RAG service** (Node.js Express) handles search, ingestion, and embedding
- **OpenAI text-embedding-3-small** for 1536-dimension embeddings
- **Incremental ingestion** — polls SQLite every 5 minutes, watermark-based
- **Container skill** teaches the agent to use the search API via `host.docker.internal:3847`

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `whatsapp-search` is in `applied_skills`, skip to Phase 3.

### Requirements

- Docker (for Qdrant)
- `OPENAI_API_KEY` in `.env` (for embeddings)

## Phase 2: Apply

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-whatsapp-search
```

This adds:
- `rag-system/` — complete RAG service with Qdrant client, ingestion, embeddings, and Express API
- `container/skills/whatsapp-search/SKILL.md` — agent-facing docs

And modifies:
- `src/container-runner.ts` — adds `--add-host host.docker.internal:host-gateway` so containers can reach the host RAG API

### Start Qdrant

```bash
cd rag-system/docker && docker compose up -d
```

### Install and build the RAG service

```bash
cd rag-system && npm install && npx tsc
```

### Set up systemd service

Create `~/.config/systemd/user/nanoclaw-rag.service`:

```ini
[Unit]
Description=NanoClaw RAG Search Service
After=docker.service

[Service]
Type=simple
WorkingDirectory=%h/code/yonibot/gabay/rag-system
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now nanoclaw-rag
```

Rebuild the container so the agent picks up the new skill:

```bash
./container/build.sh
```

## Phase 3: Verify

Check the RAG service health:

```bash
curl http://localhost:3847/health
curl http://localhost:3847/api/stats
```

Ask the agent to search for something:

> Search our chat history for discussions about [topic]
