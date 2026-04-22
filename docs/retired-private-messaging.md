# Retired Private Messaging Surface

The private-message implementation was removed from the active application during the comment-only pivot.

## Preservation refs

- Archive branch: `archive/private-messaging`
- Archive tag: `pre-comment-pivot-2026-04-21`

## Removed runtime surface

- `/messages`
- `/api/reddit/send-message`
- `/api/reddit/private-messages`
- `/api/reddit/process-inbox`
- old PM scan/scheduler routes under `src/app/api/reddit/scan-*`
- PM UI/components such as `MessageInbox`, `SendMessage`, and the legacy scan dashboard widgets

## Recovery guidance

If PM logic ever needs to be reviewed, inspect the archive branch/tag rather than restoring dead code into `main`.
