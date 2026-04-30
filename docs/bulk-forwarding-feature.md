# Bulk Forwarding Feature

## Overview
Allows staff members to select multiple conversations from the inbox and forward them all at once to external email addresses. This is useful for escalations, reporting, or sharing multiple customer conversations with external parties.

## Implementation

### User Interface

#### Selection
- Users can select multiple conversations using checkboxes in the inbox list
- Supports "Select All" to forward all conversations matching current filters
- Shows selection count in bulk actions bar

#### Forward Button
Located in the bulk actions bar alongside other bulk operations:
```
[ 2 selected ] | Reopen | Close | Waiting on user | Forward | Assign
```

#### Bulk Forward Dialog
- **Checkbox**: "Forward entire conversation threads" - includes all messages
- **To Field**: Email addresses (comma-separated for multiple)
- **Note Field**: Optional context note to include with forwards
- **Summary**: Shows count and what will be forwarded
- **Confirmation**: Confirms bulk action before proceeding

### Backend Implementation

#### API Endpoint
**Location**: `trpc/router/mailbox/conversations/index.ts`

```typescript
bulkForward: mailboxProcedure
  .input({
    conversationSlugs: z.array(z.string()).min(1).max(50),
    to: z.array(z.string().email()).min(1),
    note: z.string().optional(),
    includeFullThread: z.boolean().default(false),
  })
```

#### Background Job
**Location**: `jobs/bulkForwardConversations.ts`

The job processes each conversation:
1. Fetches conversation and messages
2. Formats email with forward headers
3. Sends via Gmail API
4. Tracks success/error count

### Email Format

#### Single Message (default)
Each conversation forwards only the first message:
```
Subject: Fwd: [Original Subject]

[Optional staff note]

---------- Forwarded message ----------
From: customer@example.com
Date: Jan 10, 2026
Subject: Original subject

[First message content]
```

#### Full Thread (when checkbox is checked)
Each conversation forwards all customer and staff messages:
```
Subject: Fwd: [Original Subject]

[Optional staff note]

---------- Forwarded conversation ----------
Subject: Original subject
Messages: 4

[Customer] 2:30 PM - Message 1
[Staff] 2:45 PM - Message 2
[Customer] 3:00 PM - Message 3
[Staff] 3:15 PM - Message 4
```

## Use Cases

### 1. Weekly Escalation Report
```
Scenario: Forward all high-priority unresolved tickets to management
Action: Filter by priority → Select all → Forward with note
Result: Management receives all tickets in one batch
```

### 2. Customer Success Handoff
```
Scenario: Transfer multiple VIP customers to dedicated account manager
Action: Filter by VIP tag → Select relevant → Forward full threads
Result: Account manager has complete conversation history
```

### 3. Bug Reports to Engineering
```
Scenario: Multiple customers reporting same issue
Action: Search for bug keyword → Select affected tickets → Forward
Result: Engineering team sees all related customer reports
```

### 4. Compliance/Audit Export
```
Scenario: Legal needs all conversations with specific customer
Action: Filter by customer email → Select all → Forward full threads
Result: Legal has complete audit trail
```

## Technical Details

### Limits
- Maximum 50 conversations per bulk forward
- Prevents overwhelming Gmail API and recipients

### Processing
- Background job processes forwards asynchronously
- User receives notification when complete
- Individual failures don't block entire batch

### Email Delivery
- All forwards sent via Gmail API
- Appear in Gmail Sent folder
- Use connected Gmail account credentials

### Error Handling
- Tracks success/error count per batch
- Logs errors for failed conversations
- Returns summary to user

## Files

### Frontend
1. ✅ `app/(dashboard)/[category]/list/bulkForwardDialog.tsx` - Dialog component
2. ✅ `app/(dashboard)/[category]/list/conversationList.tsx` - Added Forward button

### Backend
1. ✅ `trpc/router/mailbox/conversations/index.ts` - Added bulkForward mutation
2. ✅ `jobs/bulkForwardConversations.ts` - Background job handler
3. ✅ `jobs/trigger.ts` - Added event definition

## User Flow

```
1. User filters/searches conversations
   ↓
2. Selects multiple conversations (or "Select All")
   ↓
3. Clicks "Forward" in bulk actions bar
   ↓
4. Dialog opens:
   - Optional: Check "Forward entire threads"
   - Enters recipient email(s)
   - Optional: Adds context note
   ↓
5. Clicks "Forward [X]" button
   ↓
6. Confirmation prompt
   ↓
7. Background job processes forwards
   ↓
8. User receives notification when complete
   ↓
9. All forwards appear in Gmail Sent folder
```

## Configuration

**Requirements:**
- Gmail connected via OAuth ✅
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` configured ✅

**No additional setup needed!**

## Testing Checklist

- [ ] Select 2-3 conversations and forward
- [ ] Test "Select All" with filtered conversations
- [ ] Forward with full thread option
- [ ] Forward with custom note
- [ ] Multiple recipients (comma-separated)
- [ ] Verify emails appear in Gmail Sent
- [ ] Check recipients receive properly formatted emails
- [ ] Test error handling (invalid email, Gmail disconnected)
- [ ] Verify background job completes
- [ ] Check success/error counts are accurate

## Benefits

✅ **Efficient Escalations** - Forward multiple tickets at once
✅ **Batch Reporting** - Share multiple conversations with stakeholders
✅ **Time Savings** - No need to forward each conversation individually
✅ **Context Preservation** - Optional full thread forwarding maintains conversation history
✅ **Audit Trail** - All forwards tracked in Gmail Sent folder
✅ **Flexible** - Works with any combination of filters and searches
