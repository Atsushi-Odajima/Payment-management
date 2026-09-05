# Announcements

Create and publish **notices, maintenance windows and incidents** for merchants.

## Kinds and where they show

| Kind | Shown |
|---|---|
| Notice | Announcement list and merchant API only (not pinned in the bell) |
| Maintenance | **Pinned** at the top of the header notification bell (yellow badge) |
| Incident | **Pinned** at the top of the notification bell (red badge), with a timeline (occurred → investigating → resolved) |

Only live announcements (status “Published” and inside their window) are shown. A merchant calls `GET /api/merchant-api/announcements` with its API key to receive the announcements addressed to it (all-merchant ones plus those that name it).

## Creating and publishing

1. **+ New announcement**: kind, title, body, publish from / until (empty = until ended) and audience (all merchants or selected ones).
2. **Save as draft** or **Publish**. A draft can be published from its detail at any time; a published one can be **ended**, and an ended one republished.
3. For incidents the body is recorded as the first “occurred” update. Use **Add update** on the detail to append “investigating” and “resolved” entries; the pinned entry shows the latest phase.

Creating, editing, publishing, ending and adding updates are all written to the audit log.
