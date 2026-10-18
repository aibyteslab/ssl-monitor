# 🔒 AI Bytes Lab — EU-First SSL Certificate Monitor

Automated SSL/TLS certificate monitoring with **Mistral AI** analysis, built for self-hosted **n8n**.

**Built with n8n · AI analysis powered by Mistral AI**

The workflow checks certificates directly over TLS, classifies certificate health, and invokes Mistral for bounded batches of issues to select and prioritize reviewed remediation actions. Mistral inference is routed through the **EU regional endpoint**.

## What it does

1. Runs daily at 08:00.
2. Connects directly to each configured domain over TLS.
3. Classifies certificates as OK, WARNING, CRITICAL, EXPIRED, INVALID, TIMEOUT, or ERROR.
4. Sends a minimal certificate-status summary and approved action catalog to Mistral for up to 10 issues.
5. Validates AI-selected actions and builds one shared, deduplicated recommendation list; uses a local plan when AI is skipped or fails.
6. Sends a branded HTML report by email.

## Architecture

```text
Daily Trigger
  → Domain List (1–50 targets)
  → Validate Configuration
  → Direct TLS Check (all targets, at most 5 concurrent)
  → Validate / Normalize
  → Aggregate Results
  → Issues?
      ├─ No  → Local log only
      └─ Yes → Build approved action policy
                 ├─ 1–10 issues, bounded request → Mistral EU inference
                 │                                 → Validate action IDs
                 └─ Larger batch / failure → Local remediation plan
                       → Build HTML Report
                       → SMTP
```

The certificate checks themselves do not depend on an external certificate-checking API.

## Alert thresholds

| Days remaining | Status | Severity |
|---|---|---|
| 15+ | OK | info |
| 8–14 | WARNING | warning |
| 1–7 | CRITICAL | critical |
| < 0 | EXPIRED | critical |
| invalid CA trust, name mismatch or not-yet-valid | INVALID | critical |
| connection failure | ERROR / TIMEOUT | critical |

## Requirements

- A maintained self-hosted n8n release with external task runners for production
- Node.js built-in `tls`, `dns`, and `net` modules enabled for Code nodes
- Mistral API key saved in an n8n **Mistral Cloud API** credential
- SMTP credentials saved in n8n

Code execution must allow exactly the Node.js built-ins `tls,dns,net`. Do not use wildcard module permissions or enable insecure runner mode. For a runtime that reads these environment values directly:

```yaml
environment:
  - NODE_FUNCTION_ALLOW_BUILTIN=tls,dns,net
  - N8N_RUNNERS_TASK_TIMEOUT=150
```

For **external task runners**, merge the following values into the **existing JavaScript runner's** `env-overrides` in its launcher configuration, preserving the rest of the supplied file:

```json
{
  "NODE_FUNCTION_ALLOW_BUILTIN": "tls,dns,net",
  "N8N_RUNNERS_TASK_TIMEOUT": "150"
}
```

These are configuration fragments, not complete Compose/launcher files. Apply the task timeout on the n8n broker as well, keep n8n/runner image versions matched, and restart the affected services. A `Module 'tls' is disallowed` error means the allowlist was not applied to the process actually executing the Code node. See [external task runners](https://docs.n8n.io/hosting/configuration/task-runners/) and [task timeout configuration](https://github.com/n8n-io/n8n/blob/master/packages/@n8n/config/src/configs/runners.config.ts). Do not recreate data volumes, delete encryption keys, or disable sandboxing to fix this error.

> Mistral authentication uses n8n stored credentials. No Mistral API-key environment variable is required. Never paste an API key into workflow parameters, headers, Code nodes, or the exported JSON.

## Setup

1. Import `ssl-monitor.json` into n8n.
2. Configure 1–50 authorized public hostnames in **Domain List — Edit Here**. Replace the included demonstration targets before production use.
3. In **Mistral AI — Write Report**, select your stored **Mistral Cloud API** credential as described below.
4. In **Send Summary Email**, select your stored SMTP credential and configure the sender and recipient addresses.
5. Test manually.
6. Activate the workflow after validating the output.

The repository export is intentionally **inactive by default** so importing it cannot immediately start scheduled requests.

## Mistral integration

### Configure stored Mistral credentials (required)

1. Open **Mistral AI — Write Report** (HTTP Request).
2. Set **Authentication** to **Predefined Credential Type** (already configured in the export).
3. Set **Credential Type** to **Mistral Cloud API** (`mistralCloudApi`, already configured).
4. In the credential selector, choose your existing Mistral Cloud API credential. If you do not have one, create it and enter the API key **only in the credential's API Key field**. Save it and ensure it is available to this workflow's project.
5. Do not add an `Authorization` header under **Send Headers**. n8n's credential implementation adds the Bearer header at execution time.

Compatibility is based on n8n's [Mistral Cloud API credential implementation](https://github.com/n8n-io/n8n/blob/master/packages/@n8n/nodes-langchain/credentials/MistralCloudApi.credentials.ts), which defines generic header authentication, and the HTTP Request node's [predefined credential selector](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/HttpRequest/V3/Description.ts), which accepts credentials with `authenticate`. See also [HTTP Request authentication](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/#authentication).

If your installed n8n version does not offer **Mistral Cloud API** in this selector, update n8n or use **Generic Credential Type → Header Auth** with a stored Header Auth credential: set **Name** to `Authorization` and **Value** to `Bearer <your API key>` **inside that credential only**. Select it in the HTTP Request node; never put that value in node headers or the public export.

The published JSON deliberately contains **no credential bindings**: neither personal credential IDs/names nor secrets, including SMTP. It also omits source-instance/workflow metadata. Each importer must select their own Mistral and SMTP credentials. n8n may add credential IDs/names and instance metadata when exporting a configured workflow again; remove these before sharing or committing it.

### Migrating an existing import

Updating this repository does not update a workflow already imported into n8n. Re-import the new JSON and select your credentials. This security update adds configuration validation and AI bypass nodes; changing only the HTTP Request node is insufficient. Remove the old manual `Authorization` header and its environment-variable expression. Once no other workflow depends on it, remove the old Mistral API-key environment setting from your n8n deployment.

### Verify before activation

Run manually against a controlled target that triggers an issue (for example `expired.badssl.com`) so the Mistral branch actually executes. Confirm the HTTP node returns a successful Mistral response, the email identifies a validated Mistral-selected remediation plan, and the SMTP node sends successfully. A healthy-only run skips Mistral; a local plan alone does not prove authentication works. An unset credential can fail n8n's pre-execution validation, so bind both credentials before running; do not rely on HTTP fallback for missing credentials.

The repository change is structurally validated; a live n8n run with your locally stored credentials is still required.

The workflow currently uses `mistral-small-latest` for concise SSL/TLS security analysis and calls:

```text
https://api.eu.mistral.ai/v1/chat/completions
```

Mistral documents this as its EU regional inference endpoint. Regional inference controls where eligible inference input and output processing occurs. It does **not** imply that every Mistral control-plane function (for example account configuration, billing, API-key management, or usage analytics) is regional.

Before production use, verify that the selected model is available on the EU endpoint.

## Data flow and privacy

### Processed locally

The self-hosted workflow performs TLS connections and certificate inspection locally. It derives certificate metadata such as:

- domain
- status / severity
- expiry date
- days remaining
- issuer names are omitted rather than retained as untrusted display text

### Sent to Mistral

Only the structured certificate summary, finding identifiers, and the reviewed action catalog required for planning are sent to Mistral. Public target hostnames are included; treat the configured inventory as data shared with Mistral. Owner and raw certificate-issuer text are excluded. No traffic logs, application payloads, user records, server credentials, or private keys are intentionally included.

### Important boundary

This project is **EU-first**, not a claim that every component or every piece of operational metadata remains exclusively in the EU. Mistral regional inference and any separate SMTP/n8n infrastructure have their own processing and retention characteristics.

Organizations deploying the workflow remain responsible for evaluating their own GDPR, contractual, retention, and security requirements.

## Security design

- Mistral authentication uses n8n stored credentials; no API key, credential ID/name, or environment-variable lookup is embedded in the public workflow.
- TLS checks are performed directly instead of through a third-party certificate-checking service.
- Mistral is called only for 1–10 issues and a request within the size limit. All other issue batches receive a complete local remediation plan.
- Both A and AAAA DNS results must finish within the deadline. Every returned address is checked, and the TLS connection is pinned to a validated literal IP (no second DNS lookup). Private, metadata, multicast, documentation, benchmark, protocol-assignment and transition ranges are rejected. IPv6 policy is deliberately conservative, including globally reachable exceptions within excluded special-purpose blocks. The deny policy is based on the [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/) and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/) registries and must be reviewed as registries evolve.
- Certificate expiry, host matching and CA-chain authorization are evaluated separately. A relaxed handshake is only used to inspect broken certificates; it is **never** treated as evidence of trust.
- Structured, minimized findings are submitted to Mistral without raw certificate/owner/issuer text. Raw certificate issuer names are omitted from the email as well: attacker-controlled organization text must not become report instructions.
- No model-generated prose is rendered. Only validated IDs select trusted local explanations, actions and verification guidance. Every dynamic display field (including domains, owner and certificate metadata) is HTML-escaped and visibly defangs bare addresses, for example `expired[.]badssl[.]com` and `user[at]example[.]com`, to discourage email-client auto-linking. Unicode dot variants and hidden directional characters are normalized/removed. The generated HTML contains no anchors or external resources.
- Reports use a fluid, single-column list: each domain appears once with its certificate outcome and expiry date. All configured targets, including healthy ones, stay in the email. Reviewed recommendations are deduplicated across targets, overlapping preventive advice is suppressed, and verification guidance appears once at the end. There are no attachments, per-domain recommendation blocks, wide data tables, or media-query dependencies. Long hostnames wrap without inserting literal spaces into their displayed text.
- If Mistral fails, is skipped, or returns a noncompliant plan, the workflow sends the complete certificate findings and locally generated approved remediation steps. It does not display the rejected response.
- Mistral HTTP requests have a 30-second timeout, do not follow redirects, retain HTTPS certificate validation, retry once, and continue to local reporting on failure. Monitored TLS targets receive no Mistral or SMTP credentials.
- Both checking and parsing preserve every configured target; invalid targets become explicit error findings. Invalid configuration counts and malformed internal results fail visibly rather than reporting unchecked targets as healthy.
- The workflow export ships inactive, has a 240-second execution timeout, and disables saved success/error/manual execution data and execution-progress persistence. This setting does not redact third-party logs, backups, or live manual-run views.
- AI output is advisory; certificate status and severity are determined deterministically before the model is called.

## How Mistral AI contributes

Mistral AI selects and orders reviewed remediation actions for verified TLS findings, prioritizes issues within severity groups, and selects preventive recommendations. The model helps turn certificate monitoring into an operational plan while its choices remain bounded by a local policy.

Certificate expiry, hostname matching and certificate-chain trust are checked directly through TLS. Locally reviewed wording reports each finding and supplies shared remediation and verification guidance. Connection failures are described as incomplete inspections, not proof of an expired or invalid certificate.

The request uses Mistral [JSON mode](https://docs.mistral.ai/capabilities/structured_output/json_mode). The response may contain only finding IDs, exact evidence copies, approved action IDs and prevention IDs. The validator checks complete and unique finding coverage, exact evidence, critical-before-warning ordering, unique allowed IDs, and the required first action for each issue. Mistral may reorder findings within a severity group and choose/order optional actions approved for that finding.

**Free-form model prose, commands, URLs and newly invented action IDs are never displayed.** A response can preserve correct evidence and still contain dangerous advice; therefore evidence matching alone is insufficient. Unexpected fields or noncompliant selections reject the whole AI plan and activate a complete local plan. The AI has no tools and cannot change certificate results, credentials, recipients, target hostnames or infrastructure settings. A compromised model could still choose a less helpful allowed ordering, but cannot add arbitrary report instructions through its response.

### Resource limits

| Boundary | Limit / behavior |
|---|---|
| Configured targets | 1–50; invalid counts fail before network access |
| Concurrent inspections | At most 5 |
| Email length | One concise row per domain (up to 50); each shared action and verification step appears once; no attachments |
| DNS | 3-second absolute deadline; stalled resolver is cancelled |
| TLS handshake / inspection | 8-second absolute deadline; socket is destroyed on completion or failure |
| Entire scan | 120 seconds; pending targets receive explicit timeout findings |
| AI batch | At most 10 issues; larger batches bypass HTTP and use local plans |
| AI request / completion | 32,000-character request; 4,000 output tokens; 16,000-character response accepted by validator |
| Mistral HTTP | 30 seconds per attempt; at most 2 attempts; no redirects |
| Workflow execution | 240 seconds; ensure the deployment allows this timeout |

Do not increase these independently without rechecking execution duration, memory, response truncation and email clipping. These bounds apply per execution; configure host-level concurrency and quotas to control overlapping/manual runs. Invalid configuration is an execution failure, not a successfully completed scan; monitor execution failures separately.

### Updating an existing workflow

**Re-import the entire `ssl-monitor.json`.** This version supports 1–50 targets and a compact domain/expiry list with shared recommendations. It includes the security validation and AI-bypass nodes from the previous update, adjusts execution limits, and disables SMTP attribution links. Re-select your credentials and target configuration after importing.

After import, configure your target list, sender/recipient, schedule/timezone, and stored Mistral and SMTP credentials. A live test must confirm an accepted Mistral-selected plan. A fallback-only email does not establish that AI authentication or generation worked. Existing execution records are not removed by the new no-save settings; apply your deployment's retention policy to historical data and backups.

## Files

| File | Purpose |
|---|---|
| `ssl-monitor.json` | Importable n8n workflow |
| `README.md` | Architecture, setup, security, and data-flow documentation |
| `LICENCE` | MIT license |
| `tests/*.test.cjs` | Mocked workflow security and reporting regression tests |

## Security limitations

- This is a public-domain monitor. Internal and private destinations are deliberately blocked. Use a separately isolated workflow for internal certificates.
- Public IP filtering is defense-in-depth; enforce egress controls at the host, container, or firewall level, and restrict n8n workflow edit permissions.
- Domain and owner configuration is trusted administrator input. Do not let external users modify the workflow or env vars.
- DNS/IP filtering is intentionally conservative and does not promise a complete registry of special-use addresses; deploy network-layer egress denial rules as well.
- Each hostname is inspected at one validated DNS address; this is not a full audit of every load-balancer/backend address or every TLS protocol/cipher.
- Certificate validity is based on the host runtime clock and built-in Node.js trust store. Root-store configuration and intermediate certificates can affect the result.
- Defanging reduces automatic linking; final rendering is controlled by the receiving mail client. Verify the received message in your target clients; workflow HTML cannot enforce client-side behavior or protect a compromised n8n/SMTP installation.
- Prompt injection can still influence model choices. Data minimization and the action-ID boundary constrain its effect; no claim is made that the model itself is immune. Keep the action catalog under review and never automatically execute remediation.
- Do not import into production without checking n8n task-runner built-in module permissions and running the validation checklist.

## Deployment controls (required outside the JSON)

The export cannot configure or verify your host. Before production use:

- Run a maintained n8n version with external task runners and restricted workflow/credential editing permissions. Treat anyone able to edit Code nodes as privileged. Keep the runner broker private and authenticate runner connections. See [task-runner hardening](https://docs.n8n.io/hosting/securing/hardening-task-runners/).
- Enforce firewall/network-policy egress controls **on the runner as well as n8n**: deny private, link-local, cloud metadata, special-use and locally sensitive networks. Allow DNS only to trusted resolvers and TCP 443 only for intended public TLS targets; n8n separately needs Mistral HTTPS and your SMTP service. Permit only the runner-to-broker control connection needed for operation. Custom routing or proxies can undermine address classification.
- Where supported (n8n 2.12+), enable `N8N_SSRF_PROTECTION_ENABLED=true` for HTTP nodes. This is additional protection; it must not be assumed to intercept raw `tls` sockets in Code nodes. See [n8n SSRF protection](https://docs.n8n.io/hosting/securing/ssrf-protection/).
- Store API/SMTP secrets only in n8n credentials, protect the n8n encryption key and backups, configure SMTP with TLS and certificate verification, and configure SPF/DKIM/DMARC for the sending domain. Never enable insecure runner mode or wildcard module access.
- Limit overlapping executions and API spending, enable execution-failure alerts, and control access/retention for logs, manual-run views and backups. The export's no-save policy does not cover external observability systems.
- Run the [n8n security audit](https://docs.n8n.io/hosting/securing/security-audit/) against the actual deployment. Repository tests cannot prove the security of a running instance.

## Testing

Run `node --test tests/*.test.cjs` with Node.js 18+. Tests execute the actual exported Code nodes with mocked DNS, TLS and Mistral responses. They cover every configured domain, input projection, public/private IPv4 and IPv6, metadata and benchmarking ranges, DNS pinning, cancellation, absolute deadlines, concurrency, certificate classifications, malicious AI selections, local fallback, HTML injection, address defanging, bounded batches and export settings. They do not send email, contact monitored targets or call Mistral.

Before activation, test the imported workflow in your environment:

1. Configure at least three authorized public targets with different outcomes. Confirm every target appears in the final report and that a healthy first target cannot hide problems in later targets.
2. Confirm a controlled expired certificate, self-signed certificate and hostname mismatch yield the expected statuses. Verify invalid/private targets never create TLS connections.
3. Verify DNS/TLS failures remain explicit findings and do not suppress other results. Observe failed execution alerts for empty/oversized configuration.
4. For 1–10 issues, confirm the Mistral response is accepted and only reviewed actions appear. Inject an unknown/dangerous action ID into a test response; confirm it is not displayed and local remediation replaces it.
5. For 11–50 issues, confirm HTTP is skipped, all results remain visible and the plan is clearly marked local. Confirm HTTP timeout/failure also produces local remediation.
6. Verify stored credentials, SMTP transport, failure monitoring, sender authentication, schedule and timezone. Inspect mobile/desktop received messages for wrapping and automatic links. A 30-target run must show 30 concise domain rows, one occurrence of each shared recommendation, one verification step and no attachments.
7. Confirm no new execution payloads are saved under normal/error/manual runs and review infrastructure logs/retention separately.

Live n8n, Mistral, SMTP, network-policy and deployment-audit verification is still required; mocked tests are not a production penetration test.

## License

MIT.

---

Not affiliated with or endorsed by Mistral AI.

AI Bytes Lab — Bucharest, Romania
