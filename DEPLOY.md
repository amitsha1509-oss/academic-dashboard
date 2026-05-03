# Deploy Guide

When you're ready to put the dashboard online so friends can use it without your laptop being on, this is the path. Estimated time: ~3 hours first time.

---

## What you'll need

- A credit card (none of the options charge $0; the cheap ones charge $4-8/mo).
- Your `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` from `OAUTH_SETUP.md`.
- A GitHub account (we'll push the code to a private repo first).

---

## Path A — Fly.io (~$2-5/mo) — recommended for cost-conscious

Persistent volumes are Fly's happy path for SQLite, and the small machine sizes match your traffic.

### 1. Install the Fly CLI

```cmd
iwr https://fly.io/install.ps1 -useb | iex
```

Sign up + log in:

```cmd
fly auth signup
```

### 2. Initialize Fly in the project

From the project root:

```cmd
fly launch --no-deploy
```

Pick a region close to Israel (`fra` for Frankfurt is the closest with consistent capacity). When asked about Postgres or Redis, say **No**.

This creates `fly.toml` and `Dockerfile`. Open `fly.toml` and add:

```toml
[mounts]
  source = "academic_data"
  destination = "/var/data"
```

### 3. Create the volume

```cmd
fly volumes create academic_data --size 1
```

(1 GB is the smallest, ~$0.15/mo. Plenty of room for SQLite for years.)

### 4. Set secrets

```cmd
fly secrets set GOOGLE_API_KEY=<your-gemini-key>
fly secrets set GOOGLE_OAUTH_CLIENT_ID=<your-oauth-client-id>
fly secrets set GOOGLE_OAUTH_CLIENT_SECRET=<your-oauth-secret>
fly secrets set SESSION_SECRET=<your-64-byte-random>
fly secrets set DB_PATH=/var/data/academic.sqlite3
fly secrets set BASE_URL=https://<your-app-name>.fly.dev
fly secrets set COOKIE_SECURE=1
```

(`fly launch` told you the app name. Use that in `BASE_URL`.)

### 5. Add the redirect URI to Google OAuth

Go back to https://console.cloud.google.com → Credentials → your OAuth client → Authorized redirect URIs. Add:

`https://<your-app-name>.fly.dev/auth/google/callback`

Click **Save**.

### 6. Deploy

```cmd
fly deploy
```

First deploy takes 2-3 minutes (Docker build + push). Subsequent deploys are ~1 min.

When it finishes, hit `https://<your-app-name>.fly.dev/` in a browser. Sign in with Google. Your data should be there because we used the same DB path and the volume is fresh.

**Wait — your DB isn't on the volume yet.** You need to copy your local `academic.sqlite3` to the Fly volume. Quickest way:

```cmd
fly ssh console
mkdir -p /var/data
exit
```

Then upload:

```cmd
fly ssh sftp shell
put academic.sqlite3 /var/data/academic.sqlite3
exit
```

Restart the app: `fly apps restart`. Now your existing data is live on production.

---

## Path B — Hetzner CX22 ($5/mo) — recommended for learning Linux

A real Linux box. More setup, but you learn how things actually work, and the hosting bill stays flat at $4.59/mo with no surprise scaling charges.

### 1. Sign up at https://www.hetzner.com/cloud

Pay method, then create a project. Pick **CX22 (€3.79/mo)** in any data center.

### 2. SSH into your box

```cmd
ssh root@<your-box-ip>
```

(Use the SSH key you set up at signup.)

### 3. Install Python + dependencies

```bash
apt update && apt install -y python3 python3-pip python3-venv git nginx
```

### 4. Clone the repo and set up the app

```bash
cd /opt
git clone https://github.com/YOU/academic-dashboard.git academic
cd academic
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 5. Create a `.env`

```bash
cat > /opt/academic/.env <<'EOF'
GOOGLE_API_KEY=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
SESSION_SECRET=...  # generate with secrets.token_urlsafe(64)
DB_PATH=/opt/academic/academic.sqlite3
BASE_URL=https://your-domain.com
COOKIE_SECURE=1
EOF
chmod 600 .env
```

### 6. Upload your local DB

From your Windows machine:

```cmd
scp academic.sqlite3 root@<your-box-ip>:/opt/academic/academic.sqlite3
```

### 7. Run as a systemd service

```bash
cat > /etc/systemd/system/academic.service <<'EOF'
[Unit]
Description=Academic Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/academic
EnvironmentFile=/opt/academic/.env
ExecStart=/opt/academic/.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now academic
systemctl status academic
```

### 8. Set up HTTPS with Caddy (easier than nginx + certbot)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Edit `/etc/caddy/Caddyfile`:

```
your-domain.com {
    reverse_proxy 127.0.0.1:8001
}
```

(If you don't own a domain yet, use `<your-box-ip>.sslip.io` — `sslip.io` is a free wildcard DNS that resolves any IP.)

```bash
systemctl reload caddy
```

Caddy will get a free Let's Encrypt cert automatically. Your dashboard is now at `https://your-domain.com`.

### 9. Add the redirect URI to Google OAuth

Same as Path A step 5: add `https://your-domain.com/auth/google/callback` in the OAuth client config.

---

## Either path: smoke test

1. Open the production URL in a fresh browser (incognito helps).
2. Click "Sign in with Google".
3. Approve. Should land on the dashboard with your data.
4. Open another browser as a friend's email (added in OAUTH_SETUP step 8 — Test users list).
5. Sign in. Should see empty dashboard with "add your first course" prompt.
6. Create a category. Confirm you don't see THEIR category (and they don't see YOURS).

---

## Backup plan

SQLite means your data is one file. **Take a backup before any deploy.**

Path A (Fly):
```cmd
fly ssh sftp shell
get /var/data/academic.sqlite3 backup-YYYY-MM-DD.sqlite3
```

Path B (Hetzner):
```cmd
scp root@<your-ip>:/opt/academic/academic.sqlite3 backup-YYYY-MM-DD.sqlite3
```

A weekly backup cron is left as future work.

---

## Cost summary at this scale

| Item | Path A (Fly) | Path B (Hetzner) |
|---|---|---|
| Compute | ~$2/mo | ~$4.60/mo |
| Disk | ~$0.15/mo (1GB) | included |
| HTTPS | free | free (Caddy + Let's Encrypt) |
| Domain | optional ($10/yr) | optional ($10/yr) |
| Gemini API | ~$1-2/mo | ~$1-2/mo |
| **Total** | **~$3-4/mo** | **~$5-7/mo** |
