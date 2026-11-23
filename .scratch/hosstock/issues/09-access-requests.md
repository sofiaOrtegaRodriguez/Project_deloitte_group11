# 09: Access Requests

**What to build:** A hospital employee registers and creates an Access Request. The Director sees a badge on Settings → Users, approves or rejects the request, and approved people log in as Procurement Team. Login messages explain the Pending and Rejected states, but only after a correct password.

**Blocked by:** 02 (Director login and app shell)

**Status:** ready-for-agent

- [ ] Register page: name, unique email, password of at least 8 characters → Pending account
- [ ] Correct password + Pending → "Your access request is pending approval"; correct password + Rejected → a rejection message; wrong password → generic message only
- [ ] A Rejected email can register again
- [ ] Settings → Users (Director only): list of Access Requests with Approve/Reject, and a pending-count badge
- [ ] Approve sets the account Active with the Procurement Team role
- [ ] User management endpoints return 403 to Procurement Team members, and the Users section is hidden for them
- [ ] Access Requests produce no Notifications
- [ ] API tests for every path above
