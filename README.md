# r2-nuker

Blow up your Cloudflare R2 buckets — safely.

r2-nuker is a CLI tool that wipes all objects and aborts all multipart uploads from your R2 buckets. It runs in dry-run mode by default so you never accidentally nuke something you didn't mean to. You can also set up bypass rules to protect specific files or folders from getting deleted.

## Features

- **Dry-run by default** — nothing gets deleted unless you explicitly pass `--force`
- **Bypass system** — protect files/folders globally or per-bucket with prefix or exact path matching
- **Batch deletion** — configurable concurrency so you don't hammer the API
- **Multipart upload cleanup** — aborts stale multipart uploads too
- **Bucket filtering** — nuke just one bucket instead of everything
- **Validated config** — Zod schema ensures your config is correct before anything runs

## Prerequisites

- [Bun](https://bun.sh) installed on your machine
- A Cloudflare R2 account with API credentials

## Quick Start

```bash
# clone the repo
git clone https://github.com/anomalyco/r2-nuker.git
cd r2-nuker

# install dependencies
bun install

# copy the example config and fill in your credentials
cp config.example.json config.json

# do a dry run first (this won't delete anything)
bun run start
```

When you're ready to actually delete stuff:

```bash
bun run nuke
```

## Configuration

Everything is configured through a `config.json` file. Copy `config.example.json` to get started:

```bash
cp config.example.json config.json
```

Here's what each field does:

### `r2` — R2 credentials

| Field | Description |
|---|---|
| `accessKeyId` | Your R2 access key ID |
| `secretAccessKey` | Your R2 secret access key |
| `endpoint` | Your R2 endpoint URL (e.g. `https://your-account.r2.cloudflarestorage.com`) |
| `region` | Region for the S3 client, defaults to `"auto"` |

### `buckets` — Buckets to nuke

An array of bucket configs. Each bucket has:

| Field | Description |
|---|---|
| `name` | Name of the R2 bucket |
| `bypass` | Array of bypass rules for this bucket (optional, defaults to `[]`) |

### `globalBypass` — Bypass rules for all buckets

Array of bypass rules that apply to every bucket. Optional, defaults to `[]`.

### `bypass` rule format

Each bypass rule (both in `bypass` and `globalBypass`) looks like this:

| Field | Description |
|---|---|
| `path` | The path or prefix to protect |
| `isPrefix` | `true` = protect everything that starts with this path, `false` = protect only this exact path |

### Other options

| Field | Default | Description |
|---|---|---|
| `dryRun` | `true` | If `true`, nothing is actually deleted — the tool just pretends |
| `concurrency` | `10` | How many objects to delete per batch (1–100) |

### Example config

```json
{
  "r2": {
    "accessKeyId": "YOUR_ACCESS_KEY_ID",
    "secretAccessKey": "YOUR_SECRET_ACCESS_KEY",
    "endpoint": "https://your-account.r2.cloudflarestorage.com",
    "region": "auto"
  },
  "buckets": [
    {
      "name": "my-bucket-1",
      "bypass": [
        { "path": "important/", "isPrefix": true },
        { "path": "config.json", "isPrefix": false }
      ]
    },
    {
      "name": "my-bucket-2",
      "bypass": [
        { "path": "backups/", "isPrefix": true }
      ]
    }
  ],
  "globalBypass": [
    { "path": "system/", "isPrefix": true },
    { "path": ".gitkeep", "isPrefix": false }
  ],
  "dryRun": true,
  "concurrency": 10
}
```

## Usage

```
bun run index.ts [options]
```

### CLI flags

| Flag | Alias | Default | Description |
|---|---|---|---|
| `--config` | `-c` | `config.json` | Path to config file |
| `--dry-run` | — | on by default | Run without deleting anything |
| `--force` | `-f` | — | Actually delete stuff (disables dry-run) |
| `--bucket` | `-b` | — | Only nuke a specific bucket by name |
| `--help` | `-h` | — | Show help text |

### Examples

```bash
# dry run with default config
bun run start

# dry run with a custom config file
bun run index.ts -c my-config.json

# actually delete everything
bun run nuke

# delete everything in a specific bucket only
bun run nuke:bucket my-bucket

# or manually
bun run index.ts --force --bucket my-bucket

# show help
bun run help
```

### Scripts

These are the shortcuts defined in `package.json`:

| Script | What it does |
|---|---|
| `bun run start` | Dry run with `config.json` |
| `bun run start:force` | Actually deletes with `config.json` |
| `bun run nuke` | Same as `start:force` |
| `bun run nuke:dry` | Same as `start` |
| `bun run nuke:bucket` | Delete a specific bucket (pass bucket name as extra arg) |
| `bun run help` | Show CLI help |
| `bun run example` | Dry run using `config.example.json` |

## Bypass System

The bypass system lets you protect certain files or folders from getting nuked. There are two levels:

- **`globalBypass`** — applies to all buckets
- **`bypass`** (inside a bucket config) — applies only to that bucket

Both work the same way. Rules from both lists are combined when checking a bucket, so a file only needs to match one rule to be protected.

### `isPrefix: true` vs `isPrefix: false`

- **`isPrefix: true`** — protects anything that *starts with* this path. Think of it like a folder. Example: `"path": "backups/"` will protect `backups/db.sql`, `backups/2024/file.zip`, etc.
- **`isPrefix: false`** — protects only this exact path. Example: `"path": "config.json"` will only protect the file named exactly `config.json` at the root, not `folder/config.json`.

### Example

Say you have a bucket with these files:

```
system/app.log
system/cache/tmp.dat
backups/db.sql
backups/2024/archive.zip
config.json
readme.md
```

With these bypass rules:

```json
"bypass": [
  { "path": "system/", "isPrefix": true },
  { "path": "config.json", "isPrefix": false }
]
```

Only `readme.md` and `backups/` would get deleted. Everything else is protected.

## Architecture

Pretty straightforward, 4 files:

```
index.ts           CLI entry point — parses args, loads config, runs the nuker, prints results
src/
  config.ts        Zod schemas for config validation + file loading
  r2-client.ts     S3 client wrapper — list objects, delete objects, abort multipart uploads
  bypass.ts        Bypass checker — decides what gets protected vs deleted
  nuker.ts         Main logic — orchestrates listing, bypass filtering, batch deletion, and upload abort
```

Flow: `index.ts` loads config → creates `R2Nuker` → for each bucket: `R2Client.listObjects` → `BypassChecker.filterBypassed` → `R2Client.deleteObjects` in batches → `R2Client.listMultipartUploads` → abort the ones that aren't bypassed → print results.

## Security

A few things to keep in mind:

- **Dry-run is the default.** The tool won't delete anything unless you pass `--force` or set `dryRun: false` in your config. Always run a dry run first.
- **`config.json` is in `.gitignore`.** Don't commit your real config — it has your R2 credentials in plain text. Use `config.example.json` as a template and keep your real config local.
- **Rotating credentials.** If you accidentally commit `config.json`, rotate your R2 API tokens immediately.

## License

MIT
