# 10: Remove/Restore, User Management Log and password change

**What to build:** The Director removes a Procurement Team member with a "Remove" button and they lose access immediately; the Director can Restore them. Every access decision appears in the User Management Log. Any User can change their own password.

**Blocked by:** 09 (Access Requests)

**Status:** ready-for-agent

- [ ] Remove sets Account Status to Removed; the User's next request fails at once (the guard checks status on every request)
- [ ] Correct password + Removed → "Your account has been removed"
- [ ] A Removed email stays blocked for registration; Restore returns the account to Active
- [ ] The Director cannot remove themselves
- [ ] User Management Log records date, action (approve, reject, remove, restore), affected User and a nullable actor field; visible in Settings to the Director
- [ ] Password change requires the current password
- [ ] API tests: immediate invalidation, self-removal blocked, log entries, password change
