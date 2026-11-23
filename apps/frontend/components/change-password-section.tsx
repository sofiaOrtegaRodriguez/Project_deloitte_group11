'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useChangePassword } from '@/lib/users';

/** Any User can change their own password; the current one is required. */
export function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const change = useChangePassword();

  function submit(event: FormEvent) {
    event.preventDefault();
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
        },
      },
    );
  }

  return (
    <section className="max-w-sm space-y-2">
      <h2 className="text-lg font-semibold">Change password</h2>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        {change.error && <p role="alert" className="text-sm text-destructive">{change.error.message}</p>}
        {change.isSuccess && <p role="status" className="text-sm text-muted-foreground">Password changed.</p>}
        <Button type="submit" disabled={change.isPending}>Change password</Button>
      </form>
    </section>
  );
}
