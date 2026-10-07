# 🔒 AI Bytes Lab — EU-First SSL Certificate Monitor

Automated SSL/TLS certificate monitoring with **Mistral AI** analysis, built for self-hosted **n8n**.

The workflow checks certificates directly over TLS, classifies certificate health, and only invokes Mistral when attention is required. Mistral inference is routed through the **EU regional endpoint**.

## What it does

1. Runs daily at 08:00.
2. Connects directly to each configured domain over TLS.
3. Classifies certificates as OK, WARNING, CRITICAL, EXPIRED, TIMEOUT, or ERROR.
4. Sends a minimal certificate-status summary to Mistral when issues exist.
5. Produces an AI-assisted security analysis and remediation guidance.
6. Sends a branded HTML report by email.

## Architecture

```text
Daily Trigger
  → Domain List
  → Direct TLS Check
  → Validate / Normalize
  → Aggregate Results
  → Issues?
      ├─ No  → Local log only
      └─ Yes → Mistral EU Regional Inference
                 → Build HTML Report
                 → SMTP
```

The certificate checks themselves do not depend on an external certificate-checking API.

## Alert thresholds

| Days remaining | Status | Severity |
|---|---|---|
| 15+ | OK | info |
| 8–14 | WARNING | warning |
| 0–7 | CRITICAL | critical |
| < 0 | EXPIRED | critical |
| TLS trust / hostname validation failure | TLS_INVALID | critical |
| connection failure | ERROR / TIMEOUT | critical |

## Requirements

- Self-hosted n8n
- Node.js built-in `tls` module enabled for Code nodes
- Mistral API key
- SMTP credentials

For self-hosted n8n, allow the TLS module:

```yaml
environment:
  - NODE_FUNCTION_ALLOW_BUILTIN=tls
  - MISTRAL_API_KEY=replace-with-your-key
```

Restart n8n after changing the environment.

> Keep `MISTRAL_API_KEY` outside the workflow export and out of Git. The included workflow references the environment variable rather than embedding an API key.

## Setup

1. Import `ssl-monitor.json` into n8n.
2. Configure the domain list in **Domain List — Edit Here**.
3. Provide `MISTRAL_API_KEY` securely to your self-hosted n8n runtime.
4. Configure SMTP credentials in n8n.
5. Test manually.
6. Activate the workflow after validating the output.

The repository export is intentionally **inactive by default** so importing it cannot immediately start scheduled requests.

## Mistral integration

The workflow uses `mistral-large-4` for SSL/TLS security analysis and calls:

```text
https://api.eu.mistral.ai/v1/chat/completions
```

Mistral documents this as its EU regional inference endpoint. Regional inference controls where eligible inference input and output processing occurs. It does **not** imply that every Mistral control-plane function (for example account configuration, billing, API-key management, or usage analytics) is regional.

`mistral-large-4` is currently a Public Preview model. Mistral's Large 4 announcement states that the preview is served from Mistral infrastructure in Europe. Before production activation, verify that `mistral-large-4` is exposed by the EU regional endpoint for your account, because regional model availability can differ.

The workflow uses the fixed preview model ID rather than a `-latest` alias.

## Data flow and privacy

### Processed locally

The self-hosted workflow performs TLS connections and certificate inspection locally. It derives certificate metadata such as:

- domain
- status / severity
- expiry date
- days remaining
- issuer

### Sent to Mistral

Only the structured certificate summary required to generate the report is sent to Mistral. No traffic logs, application payloads, user records, server credentials, or private keys are intentionally included.

### Important boundary

This project is **EU-first**, not a claim that every component or every piece of operational metadata remains exclusively in the EU. Mistral regional inference and any separate SMTP/n8n infrastructure have their own processing and retention characteristics.

Organizations deploying the workflow remain responsible for evaluating their own GDPR, contractual, retention, and security requirements.

## Security design

- API key is not embedded in the public workflow.
- SMTP credential metadata is removed from the public workflow export.
- TLS checks are performed directly instead of through a third-party certificate-checking service.
- Mistral is called only when an issue is detected.
- The AI receives a minimized certificate summary.
- The workflow export ships inactive.
- AI output is advisory; certificate status and severity are determined deterministically before the model is called.
- TLS trust validation is checked explicitly; an untrusted chain, self-signed certificate, or hostname validation failure is classified as `TLS_INVALID`.
- AI-generated report text is HTML-escaped before being inserted into the email template.

## Why use AI here?

Mistral does **not** decide whether a certificate is expired or critical. Deterministic code does that.

The model is used where an LLM is useful: turning structured findings into a concise report for technical and non-technical readers, prioritizing remediation language, and explaining next actions.

That separation keeps monitoring deterministic while making the notification layer easier to consume.

## Files

| File | Purpose |
|---|---|
| `ssl-monitor.json` | Importable n8n workflow |
| `README.md` | Architecture, setup, security, and data-flow documentation |
| `LICENCE` | MIT license |

## Testing

Use controlled test targets such as `expired.badssl.com` and `self-signed.badssl.com`. Confirm that the former is reported as `EXPIRED` and the latter as `TLS_INVALID`. Then inspect the generated report and only activate scheduling after the results are correct.

## License

MIT.

---

Not affiliated with or endorsed by Mistral AI.

AI Bytes Lab — Bucharest, Romania
