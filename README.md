# 🔒 AI Bytes Lab — Daily SSL Certificate Monitor

> Automated SSL certificate monitoring with **Mistral AI** analysis, built entirely in **n8n**.  
> No external APIs. No third-party dependencies. Self-contained and EU-sovereign.


---

## 📌 What This Does

This n8n workflow runs every morning at **08:00** and:

1. Checks SSL certificates for all your domains directly via TLS connection (no external API)
2. Categorizes each domain by status — OK, WARNING, CRITICAL, EXPIRED, ERROR
3. Sends the scan results to **Mistral AI** for a professional security analysis
4. Sends a **branded HTML email** with per-domain issue cards, AI analysis, and remediation steps

All processing stays on your own infrastructure. No data leaves your server except the Mistral API call.

---

## 📊 Alert Thresholds

| Days Remaining | Status | Severity |
|---|---|---|
| 30+ days | ✅ OK | info — no alert sent |
| 8–14 days | 🟡 WARNING | warning — alert sent |
| 1–7 days | 🔴 CRITICAL | critical — alert sent |
| Expired | 🔴 EXPIRED | critical — alert sent |
| Unreachable | 🔴 ERROR / TIMEOUT | critical — alert sent |

Alerts are only sent when there are WARNING or CRITICAL issues. If everything is healthy, no email is sent.

---

## 🗂 Workflow Architecture

```
Daily Trigger (08:00)
  └── Domain List — Edit Here
        └── Split Into Individual Domains
              └── SSL Checker (Code node — TLS)
                    └── Parse SSL Result (Code node)
                          └── Aggregate All Results (Code node)
                                └── Any Issues Found? (IF node)
                                      ├── [YES] Build Mistral Request Body (Code node)
                                      │           └── Mistral AI — Write Report (HTTP Request)
                                      │                 └── Build Email HTML (Code node)
                                      │                       └── Send Summary Email
                                      └── [NO]  Log — All Certs Healthy
```

---

## 📁 Files in This Repo

| File | Description |
|---|---|
| `ssl-monitor.json` | Full n8n workflow — import directly |
| `README.md` | This file |

---

## ⚙️ Requirements

### Self-Hosted n8n (Required for TLS module)

This workflow uses Node.js's built-in `tls` module to connect directly to domains and read certificates. This module is **blocked by default** in n8n's Code node sandbox.

**You must add this environment variable to your n8n instance:**

```yaml
# docker-compose.yml — under environment:
environment:
  - NODE_FUNCTION_ALLOW_BUILTIN=tls,https,net
```

Then restart n8n:
```bash
docker compose restart
```

> ⚠️ **Important:** `NODE_FUNCTION_ALLOW_BUILTIN` is a **self-hosted only** feature.  
> **n8n Cloud does not support importing Node.js built-in modules** in the Code node — not even `tls`, `https`, or `net`. This is a hard platform restriction with no workaround on Cloud.  
> If you are on n8n Cloud, you will need to replace the SSL Checker Code node with an HTTP Request node calling a free external API like `https://ssl-checker.io/api/v1/check/{domain}`.

---

## 🚀 Setup Instructions

### 1. Import the Workflow

In n8n: **Settings → Import from file → select `ssl-monitor.json`**

### 2. Add the Environment Variable (Self-hosted only)

Edit your `docker-compose.yml`:

```yaml
services:
  n8n:
    image: n8nio/n8n
    environment:
      - NODE_FUNCTION_ALLOW_BUILTIN=tls,https,net
      - N8N_BASIC_AUTH_ACTIVE=true
      # ... your other existing variables
```

Restart: `docker compose restart`

### 3. Configure Your Domains

Open the **"Domain List — Edit Here"** node and update the array:

```javascript
[
  { "domain": "yourdomain.com",     "owner": "Main Website" },
  { "domain": "api.yourdomain.com", "owner": "API Server" },
  { "domain": "client1.com",        "owner": "Client 1" }
]
```

### 4. Add Your Mistral API Key

In the **"Mistral AI — Write Report"** HTTP Request node, update the Authorization header:

```
Bearer YOUR_MISTRAL_API_KEY_HERE
```

Get your API key at: https://console.mistral.ai

### 5. Configure Email

In the **"Send Summary Email"** node:
- `fromEmail` — your sender address
- `toEmail` — your security team address
- Make sure your SMTP credentials are configured in n8n

### 6. Activate

Toggle the workflow to **Active**. It will run every day at 08:00.

---

## 🧪 Testing

To test immediately without waiting for the schedule:

1. Open the workflow in n8n
2. Click **"Execute Workflow"** manually
3. Add a known-expired test domain to your domain list: `expired.badssl.com`
4. Check your inbox

---

## 🤖 Mistral AI Integration

This workflow uses **Mistral Small** (`mistral-small-latest`) for the security analysis. It was chosen because:

- European company — full GDPR compliance, no CLOUD Act exposure
- Open weights model — can be self-hosted if needed
- Cost efficient — fractions of a cent per report
- Accurate for structured security analysis tasks

The prompt instructs Mistral to produce:
- Executive summary of SSL health
- Per-domain immediate action items with steps
- Deadline recommendations
- SSL hygiene recommendations

---

## 🇪🇺 Why Mistral AI?

AI Bytes Lab builds security automation exclusively with **Mistral AI** because:

- French company, European infrastructure
- No US jurisdiction — no CLOUD Act concerns
- Aligns with NIS2 and GDPR supply chain security requirements
- Open weights = option to run fully on-premise

---

## 📋 NIS2 Relevance

Expired or weak SSL certificates are a **NIS2 Article 21** compliance concern. Article 21 requires organizations to implement appropriate technical measures for security, including encryption in transit. An expired certificate means:

- Unencrypted or untrusted connections to your services
- Documented evidence of failure to maintain encryption
- Potential audit finding during NIS2 assessments

This workflow provides daily automated evidence that your SSL posture is actively monitored.

---

## 📺 Watch the Full Tutorial

> **AI Bytes Lab — YouTube**  
> [Link to video]

Subscribe for more EU-focused security automation with Mistral AI.

---

## 📄 License

MIT — free to use, modify, and distribute.

---

> **Not affiliated with or endorsed by Mistral AI.**  
> AI Bytes Lab | Bucharest, Romania | [aibyteslab.com](https://aibyteslab.com)