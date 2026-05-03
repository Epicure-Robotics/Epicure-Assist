# Message Forwarding Feature

## Overview
This feature allows staff members to forward specific messages from conversations to external email addresses. This is useful for escalations, sharing with external parties, or collaborating with people outside the organization.

## Implementation

### Backend API
- **Location**: `trpc/router/mailbox/conversations/messages.ts`
- **Mutation**: `forward`
- **Parameters**:
  - `messageId`: The ID of the message to forward
  - `to`: Array of email addresses (minimum 1)
  - `note`: Optional note to include with the forwarded message

**How it works**:
1. Validates that Gmail is connected (checks for gmailSupportEmail)
2. Verifies the message exists and belongs to the conversation
3. Creates a formatted email with:
   - Optional staff note at the top
   - Forwarded message header with From, Date, and Subject
   - Original message content (HTML or plain text)
4. Sends via Gmail API to all specified recipients
5. Forwarded email appears in your Gmail "Sent" folder
6. Returns success status

### Frontend UI

#### ForwardMessageDialog Component
- **Location**: `app/(dashboard)/[category]/conversation/forwardMessageDialog.tsx`
- **Features**:
  - Text input for email addresses (comma-separated)
  - Optional note field for adding context
  - Message preview showing From, Date, Subject, and content snippet
  - Email validation using existing `parseEmailList` utility
  - Loading state while sending
  - Success/error toast notifications

#### Integration
- **Location**: `app/(dashboard)/[category]/conversation/messageItem.tsx`
- Forward button appears on all messages (user, staff, and AI messages)
- Located in the message actions area alongside other buttons (Flag as Bad, Edit, Delete)
- Uses a tooltip for better UX

## Usage

1. **Open a conversation** with messages
2. **Find the message** you want to forward
3. **Click the "Forward" button** (appears on expanded messages)
4. **Choose forwarding option**:
   - Leave checkbox unchecked to forward just this message
   - Check "Forward entire conversation thread" to forward all messages
5. **Enter recipient email(s)** (comma-separated for multiple)
6. **Optionally add a note** to provide context
7. **Click "Forward Message"** or "Forward Conversation" to send

## Requirements

### Gmail Integration
The feature requires Gmail to be connected to your mailbox:
- A Gmail account must be connected via OAuth in Settings → Integrations
- The Gmail API credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) must be configured

If Gmail is not connected, users will see an error message: "Gmail is not connected. Please connect a Gmail account to use email forwarding."

### Benefits of Using Gmail API
- Forwarded emails appear in your Gmail "Sent" folder for tracking
- Uses your existing Gmail integration
- Maintains email thread history
- More reliable deliverability

## Email Format

### Single Message Forward
The forwarded email includes:
1. **Staff Note** (if provided): Added at the top for context
2. **Forward Header**: Styled box with original message metadata
   - From: Original sender's email
   - Date: Full date and time of the original message
   - Subject: Conversation subject
3. **Original Content**: The full HTML or plain text content of the message

### Full Thread Forward
When forwarding entire conversation:
1. **Staff Note** (if provided): Added at the top for context
2. **Thread Header**: Shows conversation subject and total message count
3. **All Messages**: Each message displayed with:
   - Role indicator (Customer/Staff)
   - Timestamp
   - Sender email (if available)
   - Message content
   - Visual separators between messages
   - Note: AI Assistant messages are excluded from forwards

## Security & Permissions

- Only authenticated staff members can forward messages
- Messages can only be forwarded from conversations the user has access to
- Validates that the message belongs to the specified conversation
- Email addresses are validated before sending
- Uses BCC when sending to multiple recipients (planned for future enhancement)

## Future Enhancements

Potential improvements:
1. Add file attachments to forwarded emails
2. Track forwarding history in the conversation timeline
3. Add a "Forward as new conversation" option
4. Support forwarding multiple messages at once
5. Add templates for common forwarding scenarios
