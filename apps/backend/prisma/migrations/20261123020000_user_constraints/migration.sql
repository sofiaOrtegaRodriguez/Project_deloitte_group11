-- User rules enforced by the database (partial unique indexes):
--  * exactly one Director;
--  * an email belongs to at most one User that is not Rejected (a Rejected User frees the email).
-- CreateIndex
CREATE UNIQUE INDEX "users_single_director" ON "users"("role") WHERE (role = 'DIRECTOR');

-- CreateIndex
CREATE UNIQUE INDEX "users_email_not_rejected" ON "users"("email") WHERE (status <> 'REJECTED');
