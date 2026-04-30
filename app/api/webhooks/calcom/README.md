# Cal.com Webhook Handler

This webhook handler automatically adds a guest email (`itssonibharat@gmail.com`) to all new Cal.com bookings.

## Setup

### 1. Environment Variables

Add the following to your `.env.local` and `.env.production` files:

```bash
CAL_API_KEY="cal_live_f6287564d08fa6a06b843fc5e81a9c2d"
```

### 2. Configure Cal.com Webhook

1. Go to your Cal.com dashboard: https://app.cal.com
2. Navigate to **Settings** → **Developer** → **Webhooks**
3. Click **New Webhook**
4. Configure the webhook:
   - **Subscriber URL**: `https://your-domain.com/api/webhooks/calcom`
     - For local testing: `https://your-ngrok-url.ngrok.io/api/webhooks/calcom`
   - **Event triggers**: Select **Booking Created**
   - **Secret** (optional): Leave empty for now (can add signature verification later)
   - **Custom Payload**: Leave as default

### 3. Testing Locally

To test the webhook locally, you'll need to expose your local server:

```bash
# Install ngrok if you haven't already
brew install ngrok

# Start your local server
pnpm run dev

# In another terminal, expose your local server
ngrok http 3000

# Use the ngrok URL in Cal.com webhook settings
# Example: https://abc123.ngrok.io/api/webhooks/calcom
```

## How It Works

1. When a new booking is created in Cal.com, it sends a webhook to your endpoint
2. The handler receives the `BOOKING_CREATED` event
3. It checks if `itssonibharat@gmail.com` is already in the attendees or guests list
4. If not, it adds the email to the booking using the Cal.com `/v2/bookings/{uid}/guests` API endpoint
5. The guest receives a "Scheduled Event" email with full booking details and calendar invite
6. Returns a success response to Cal.com

## Webhook Payload Example

```json
{
  "triggerEvent": "BOOKING_CREATED",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "payload": {
    "uid": "unique-booking-id",
    "bookingId": 100,
    "title": "Meeting Title",
    "startTime": "2024-01-01T10:00:00Z",
    "endTime": "2024-01-01T10:30:00Z",
    "attendees": [
      {
        "email": "attendee@example.com",
        "name": "Attendee Name",
        "timeZone": "UTC"
      }
    ],
    "organizer": {
      "email": "organizer@example.com",
      "name": "Organizer Name",
      "timeZone": "UTC"
    },
    "responses": {
      "guests": {
        "value": ["guest1@example.com"]
      }
    }
  }
}
```

## API Endpoints

- **POST** `/api/webhooks/calcom` - Receives Cal.com webhook events

## Customization

To change the guest email that gets added automatically, modify the `GUEST_EMAIL` constant in `route.ts`:

```typescript
const GUEST_EMAIL = "your-email@example.com";
```

## Troubleshooting

### Webhook not receiving events

- Check that the webhook URL is correct in Cal.com settings
- Verify your server is publicly accessible (use ngrok for local testing)
- Check the webhook logs in Cal.com dashboard

### Guest not being added

- Check the server logs for error messages
- Verify the Cal.com API key is correct and has proper permissions
- Ensure the booking hasn't already been created with the guest email

### API Rate Limits

Cal.com may have rate limits on API calls. If you're processing many bookings, consider implementing:

- Rate limiting
- Retry logic with exponential backoff
- Queue-based processing

## Security Considerations

### Add Webhook Signature Verification (Recommended)

To verify that webhooks are actually from Cal.com:

1. Set a secret in Cal.com webhook settings
2. Add the secret to your environment variables
3. Implement signature verification in the handler

Example:

```typescript
import crypto from "crypto";

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const hash = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return hash === signature;
}
```

## Resources

- [Cal.com Webhook Documentation](https://cal.com/docs/core-features/webhooks)
- [Cal.com API v2 Reference](https://cal.com/docs/api-reference/v2/introduction)
- [Cal.com Bookings API](https://cal.com/docs/api-reference/v2/bookings)
