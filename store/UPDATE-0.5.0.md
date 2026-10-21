# Aurora Extract 0.5.0 — store update notes

**What's new (for "What's new" / the update review):**
- Health check: new optional "Improve this profile with AI" box. "Copy audit for AI" copies a plain-text summary of the audit (score, public bio, link, latest captions, top fixes) to the user's clipboard and opens getaurorastudios.com/audit-ai in a new tab. "Copy audit only" just copies.
- **No new permission, no new host, no network request from the extension.** Nothing is transmitted by Aurora Extract. The user chooses to paste the text on our website, where it is processed under the privacy policy (new "Audit AI" section).

**Dashboard answers (unchanged):** Data usage — still no data transmitted by the extension. Single purpose — unchanged. Privacy policy URL — https://getaurorastudios.com/legal/privacy/ (now includes Audit AI).

**Description:** you may add one line under HEALTH CHECK: "Optional: copy your audit and paste it on getaurorastudios.com to get bio and caption suggestions (separate step, needs a free Aurora account)." Do not claim that the extension itself uses AI.

Upload `dist/aurora-extract-0.5.0.zip`.
