# Agents

Manage the agents that refer and support merchants.

## List

Shows agent ID, name, company, contact, fee rate, number of linked merchants, status and registration date. Click a row to open the details.

## Adding an agent

| Field | Notes |
|---|---|
| Agent ID | Auto-numbered `AGT-00001`; cannot be edited |
| Agent name / katakana | Full-width katakana only for the reading |
| Company / contact / email | Required; email is format-validated |
| Fee rate | 0–100 with up to two decimals (e.g. `3.5`) |

## Details and editing

As with merchants, the detail screen opens **read-only; Edit (top right) → Update (bottom)** saves. Edit mode also lets you switch the status (enabled / disabled).

## Linked merchants

The bottom of the detail screen lists merchants whose “Referring agent” is this agent. The link is set on the merchant add / edit form.

- Disabled agents are hidden from the select on new merchant forms (they stay visible when editing a merchant already linked to them).
