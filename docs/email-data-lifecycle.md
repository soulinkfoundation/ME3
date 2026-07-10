# Email data lifecycle

`/email` loads the active message list first. The list cache is in-memory Pinia state and is keyed by installation origin/API base, signed-in owner, folder, filters, search, and page. A cached list renders immediately and is revalidated in the background; a response only applies if it still matches the latest requested view.

| Visit | Before | After |
| --- | --- | --- |
| First view | Mailbox status, Telegram, provider settings, contacts, draft count, five folder counts, and the active list all started together (11 requests, including duplicate active/draft counts). | Active list starts first; secondary health, contacts, and the other folder counts follow (9 requests). |
| Return to a loaded folder | Empty/loading list while the request completed. | Cached list renders immediately, then one list revalidation runs in the background. |
| Manual refresh | Reloaded all data in sequence. | Forces the active-list revalidation, then refreshes secondary data. |

Archive, trash, and permanent delete update the visible list and its active cache entry before the request finishes. A failure restores the prior list and reports the error.
