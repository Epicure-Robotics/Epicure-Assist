# Why Gmail API for Forwarding?

## Comparison: Gmail API vs Resend

### ✅ Gmail API (Current Implementation)

**Advantages:**
1. **Already Integrated** - Uses existing Gmail OAuth setup, no extra configuration needed
2. **Sent Folder** - Forwarded emails appear in Gmail's "Sent" folder for tracking and auditing
3. **Thread History** - Maintains proper email threading in Gmail
4. **Unified Interface** - All outgoing emails (replies and forwards) go through the same system
5. **Better Deliverability** - Sending from your actual Gmail account has better reputation
6. **Search & Archive** - Can search forwarded emails in Gmail, apply labels, etc.
7. **Gmail Features** - Can undo send, see read receipts (if enabled), etc.
8. **Cost** - Uses existing Gmail (free or workspace), no per-email pricing

**Requirements:**
- Gmail must be connected via OAuth
- Uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (already configured)

**User Experience:**
```
Staff forwards message → Sent via Gmail API → Appears in Gmail Sent folder ✅
```

---

### ❌ Resend (Previous Approach)

**Advantages:**
1. Simple API
2. Works without Gmail setup

**Disadvantages:**
1. **Extra Service** - Requires separate Resend account and API key
2. **No Tracking** - Forwarded emails don't appear in your Gmail sent folder
3. **Lost History** - Can't search or reference forwarded emails later
4. **Cost** - Pay per email sent (though small)
5. **Inconsistency** - Replies go through Gmail, forwards through Resend
6. **From Address** - Would need to use a generic address, not your personal Gmail

**User Experience:**
```
Staff forwards message → Sent via Resend → Lost in the void ❌
(Staff has no record they forwarded it)
```

---

## Technical Implementation

### Gmail API Approach

```typescript
// Get existing Gmail credentials
const gmailSupportEmail = await getGmailSupportEmail(ctx.mailbox);
const gmailService = getGmailService(gmailSupportEmail);

// Create email using MailComposer
const mailComposer = new MailComposer({
  from: gmailSupportEmail.email, // Your actual Gmail address
  to: recipients,
  subject: `Fwd: ${subject}`,
  html: forwardBody,
});

// Send via Gmail API (same as regular replies)
await sendGmailEmail(gmailService, rawEmail, null);
```

**Result:** Email appears in Gmail, can be searched, archived, etc.

---

### Resend Approach (Not Used)

```typescript
const resend = new Resend(env.RESEND_API_KEY);
await resend.emails.send({
  from: env.RESEND_FROM_ADDRESS, // Generic address
  to: recipients,
  subject: `Fwd: ${subject}`,
  html: forwardBody,
});
```

**Result:** Email sent but no record anywhere.

---

## Decision: Gmail API ✅

**Why:** Using Gmail API provides:
- Better user experience (sent folder tracking)
- Consistency with existing email workflow
- No additional services or costs
- Professional email management
- Audit trail for compliance

The Gmail integration was already built and working, so using it for forwards was the natural choice.
