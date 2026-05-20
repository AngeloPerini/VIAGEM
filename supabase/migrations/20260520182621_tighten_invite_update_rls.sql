-- Accept/reject invite state changes are handled by RPCs that validate the
-- authenticated user's e-mail. Do not expose direct invitee UPDATE access.
drop policy if exists "Invitees can reject own pending invites" on public.group_invites;
