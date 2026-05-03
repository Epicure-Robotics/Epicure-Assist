# Full Thread Forwarding Example

## What Recipients See

When you forward an entire conversation thread, recipients receive a well-formatted email with all messages in chronological order.

### Email Format Example

```
Subject: Fwd: Help with my order

[Your optional note]

---------- Forwarded conversation ----------
Subject: Help with my order
Messages: 4

┌─────────────────────────────────────────────────┐
│ Customer - Jan 10, 2026 at 2:30 PM             │
│ From: customer@example.com                      │
│                                                  │
│ Hi, I need help with my order #12345.          │
│ It hasn't arrived yet.                          │
└─────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────┐
│ Staff - Jan 10, 2026 at 2:45 PM                │
│                                                  │
│ Hi! Let me look into that for you.             │
│ Can you provide your order date?                │
└─────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────┐
│ Customer - Jan 10, 2026 at 3:00 PM             │
│ From: customer@example.com                      │
│                                                  │
│ I ordered it on January 5th.                   │
└─────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────┐
│ Staff - Jan 10, 2026 at 3:15 PM                │
│                                                  │
│ Thanks! I can see it's in transit and should   │
│ arrive tomorrow. Tracking: 1Z999AA10123456784   │
└─────────────────────────────────────────────────┘
```

## Use Cases

### 1. Escalations
Forward entire thread to a senior team member or specialist:
```
Note: "This customer has been waiting 5 days. Can you expedite?"
✅ Forwards all 8 messages in the thread
```

### 2. External Collaboration
Share full context with vendors or partners:
```
Note: "This is the customer we discussed. See full conversation below."
✅ Forwards complete conversation history
```

### 3. Documentation
Send complete record to legal or compliance:
```
Note: "FYI - customer dispute case for review."
✅ Forwards entire conversation for audit trail
```

### 4. Handoffs
Transfer conversation to another department:
```
Note: "Transferring to billing team - customer has payment question."
✅ New team sees full conversation context
```

## Visual Styling

Messages are color-coded by role:
- **Customer messages**: Blue left border
- **Staff/AI messages**: Green left border
- **Timestamps**: Gray, 12px font
- **Separators**: Light gray horizontal lines

This makes it easy to follow the conversation flow at a glance.

## Technical Details

- Messages are fetched in chronological order
- Only includes user, staff, and AI assistant messages (no system events)
- HTML formatting preserved from original messages
- Sender email shown for customer messages
- Each message is visually separated for readability
