-- Follow-up to security_observability_and_access_hardening.
-- Trigger functions are internal implementation details and must not be RPC-callable.

REVOKE ALL ON FUNCTION public.security_audit_sensitive_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_security_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_direct_message_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_dm_group_after_message()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_watch_together_participant()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_site_visit_event()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_friend_request_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_global_chat_soft_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_notification_write()
  FROM PUBLIC, anon, authenticated;

-- Giveaway validation needs privileged auth.users access only while running as a trigger.
ALTER FUNCTION public.enforce_verified_giveaway_identity() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.enforce_verified_giveaway_identity()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_verified_nonanonymous_user(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_verified_nonanonymous_user(UUID)
  TO service_role;
