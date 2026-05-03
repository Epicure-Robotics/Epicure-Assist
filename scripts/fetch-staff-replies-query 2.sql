-- Fetch all staff replies from the last 48 hours
SELECT 
  m.id,
  m.conversation_id,
  m.user_id AS "userId",
  m.created_at,
  m.status,
  m.email_to AS "emailTo",
  m.response_to_id AS "responseToId",
  LEFT(COALESCE(m.cleaned_up_text, m.body, 'No content'), 200) AS body_preview,
  LENGTH(COALESCE(m.cleaned_up_text, m.body, '')) AS body_length
FROM messages m
WHERE 
  m.role = 'staff'
  AND m.created_at >= NOW() - INTERVAL '48 hours'
  AND m.deleted_at IS NULL
ORDER BY m.created_at DESC;

-- Summary count
SELECT 
  COUNT(*) AS total_staff_replies,
  COUNT(DISTINCT m.conversation_id) AS unique_conversations,
  COUNT(DISTINCT m.user_id) AS unique_staff_members,
  MIN(m.created_at) AS earliest_reply,
  MAX(m.created_at) AS latest_reply
FROM messages m
WHERE 
  m.role = 'staff'
  AND m.created_at >= NOW() - INTERVAL '48 hours'
  AND m.deleted_at IS NULL;
