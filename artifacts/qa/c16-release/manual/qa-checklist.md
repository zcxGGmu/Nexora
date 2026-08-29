# C16 Manual QA Checklist

- [x] 390x844 Inbox renders five mobile destinations and no document horizontal overflow.
- [x] Inbox Approvals and Failures tabs change the visible list; Mentions/Handoffs show scoped empty state.
- [x] Run Detail Pause, Stop, Retry controls preserve side-effect notes.
- [x] Deep-link refresh preserves `workspace`, `tab`, and `cursor` without replaying actions.
- [x] Stale Review keeps Approve disabled and allows reasoned Reject.
- [x] Keyboard Tab reaches the skip link; tablist uses selected tab and arrow/Home/End handling.
- [x] Interactive target dimensions are at least 44px in the 390x844 capture.
- [x] Reduced-motion media query is observed and axe reports zero violations.
- [x] 1440x900 Review capture is fresh and current-named.
- [x] launchd-managed 5173 service remains PID 96501 and HTTP 200.
