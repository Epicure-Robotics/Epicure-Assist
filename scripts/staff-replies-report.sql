-- Staff Replies Report (Last 48 Hours) - Excluding Drafts
-- This query matches the logic in fetch-staff-replies.ts

WITH
time_params AS (
  SELECT NOW() - INTERVAL '48 hours' AS start_time, NOW() AS end_time
),
reply_times AS (
  SELECT EXTRACT(EPOCH FROM (m.created_at - um.created_at)) AS reply_seconds
  FROM public.messages m
  JOIN public.conversations_conversation c ON m.conversation_id = c.id
  JOIN public.messages um ON m.response_to_id = um.id
  CROSS JOIN time_params
  WHERE m.role = 'staff'
    AND um.role = 'user'
    AND m.created_at > time_params.start_time
    AND m.created_at < time_params.end_time
    AND m.deleted_at IS NULL
    AND m.status NOT IN ('draft', 'staff_draft', 'discarded')
),
vip_reply_times AS (
  SELECT EXTRACT(EPOCH FROM (m.created_at - um.created_at)) AS reply_seconds
  FROM public.messages m
  JOIN public.conversations_conversation c ON m.conversation_id = c.id
  JOIN public.mailboxes_platformcustomer pc ON c.email_from = pc.email
  JOIN public.messages um ON m.response_to_id = um.id
  CROSS JOIN time_params
  WHERE m.role = 'staff'
    AND um.role = 'user'
    AND m.created_at > time_params.start_time
    AND m.created_at < time_params.end_time
    AND m.deleted_at IS NULL
    AND m.status NOT IN ('draft', 'staff_draft', 'discarded')
    AND pc.value > 10000
),
open_wait_times AS (
  SELECT EXTRACT(EPOCH FROM (NOW() - c.last_user_email_created_at)) AS wait_seconds
  FROM public.conversations_conversation c
  WHERE c.status = 'open'
    AND c.merged_into_id IS NULL
    AND c.last_user_email_created_at IS NOT NULL
)
SELECT 'Open Tickets' AS metric, COUNT(*)::bigint::text AS value
FROM public.conversations_conversation c
WHERE c.status = 'open' AND c.merged_into_id IS NULL

UNION ALL
SELECT 'Tickets Answered (48h)', COUNT(DISTINCT c.id)::bigint::text
FROM public.messages m
JOIN public.conversations_conversation c ON m.conversation_id = c.id
CROSS JOIN time_params
WHERE m.role = 'staff'
  AND m.created_at > time_params.start_time
  AND m.created_at < time_params.end_time
  AND m.deleted_at IS NULL
  AND m.status NOT IN ('draft', 'staff_draft', 'discarded')
  AND c.merged_into_id IS NULL

UNION ALL
SELECT 'Open Tickets Over $0', COUNT(*)::bigint::text
FROM public.conversations_conversation c
LEFT JOIN public.mailboxes_platformcustomer pc ON c.email_from = pc.email
WHERE c.status = 'open'
  AND c.merged_into_id IS NULL
  AND pc.value > 0

UNION ALL
SELECT 'Tickets Answered Over $0 (48h)', COUNT(DISTINCT c.id)::bigint::text
FROM public.messages m
JOIN public.conversations_conversation c ON m.conversation_id = c.id
LEFT JOIN public.mailboxes_platformcustomer pc ON c.email_from = pc.email
CROSS JOIN time_params
WHERE m.role = 'staff'
  AND m.created_at > time_params.start_time
  AND m.created_at < time_params.end_time
  AND m.deleted_at IS NULL
  AND m.status NOT IN ('draft', 'staff_draft', 'discarded')
  AND c.merged_into_id IS NULL
  AND pc.value > 0

UNION ALL
SELECT 'Avg Reply Time', CONCAT(
  FLOOR(AVG(reply_seconds) / 3600)::bigint, 'h ',
  FLOOR((AVG(reply_seconds) % 3600) / 60)::bigint, 'm'
)
FROM reply_times

UNION ALL
SELECT 'VIP Avg Reply Time', CONCAT(
  FLOOR(AVG(reply_seconds) / 3600)::bigint, 'h ',
  FLOOR((AVG(reply_seconds) % 3600) / 60)::bigint, 'm'
)
FROM vip_reply_times

UNION ALL
SELECT 'Avg Wait Time (Open)', CONCAT(
  FLOOR(AVG(wait_seconds) / 3600)::bigint, 'h ',
  FLOOR((AVG(wait_seconds) % 3600) / 60)::bigint, 'm'
)
FROM open_wait_times

UNION ALL
SELECT metric, value
FROM (
  SELECT 
    'Individual Reply Counts' AS metric,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'email', s.email,
          'display_name', COALESCE(s.display_name, s.email),
          'reply_count', s.reply_count
        ) ORDER BY s.reply_count DESC
      )::text
    ) AS value
  FROM (
    SELECT 
      au.email,
      up.display_name,
      COUNT(*) AS reply_count
    FROM public.messages m
    JOIN auth.users au ON m.clerk_user_id = au.id::text
    LEFT JOIN public.user_profiles up ON up.id = au.id
    CROSS JOIN time_params
    WHERE m.role = 'staff'
      AND m.created_at > time_params.start_time
      AND m.created_at < time_params.end_time
      AND m.deleted_at IS NULL
      AND m.status NOT IN ('draft', 'staff_draft', 'discarded')
    GROUP BY au.id, au.email, up.display_name
    HAVING COUNT(*) > 0
  ) s
) t;
