import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const CAL_API_KEY = env.CAL_API_KEY || "cal_live_f6287564d08fa6a06b843fc5e81a9c2d";
const CAL_API_BASE_URL = "https://api.cal.com/v2";
const GUEST_EMAIL = "mihir@openvision.engineering";

interface CalComWebhookPayload {
  triggerEvent: string;
  createdAt: string;
  payload: {
    uid: string;
    bookingId: number;
    title: string;
    startTime: string;
    endTime: string;
    attendees: {
      email: string;
      name: string;
      timeZone: string;
    }[];
    organizer: {
      email: string;
      name: string;
      timeZone: string;
    };
    responses?: {
      guests?: {
        value: string[];
      };
    };
    [key: string]: any;
  };
}

/**
 * Cal.com webhook handler
 * Automatically adds a guest email to all new bookings
 */
export const POST = async (request: Request) => {
  try {
    const body = await request.text();
    const data: CalComWebhookPayload = JSON.parse(body);

    console.log("Received Cal.com webhook:", {
      triggerEvent: data.triggerEvent,
      bookingId: data.payload?.bookingId,
    });

    // Only process BOOKING_CREATED events
    if (data.triggerEvent !== "BOOKING_CREATED") {
      console.log(`Ignoring event type: ${data.triggerEvent}`);
      return NextResponse.json({ message: "Event type not handled" }, { status: 200 });
    }

    const { bookingId, uid, attendees, responses } = data.payload;

    if (!bookingId) {
      console.error("No bookingId found in webhook payload");
      return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    }

    // Check if the guest is already in the attendees or guests list
    const existingEmails = attendees.map((a) => a.email.toLowerCase());
    const existingGuests = responses?.guests?.value || [];
    const allExistingEmails = [...existingEmails, ...existingGuests].map((e) => e.toLowerCase());

    if (allExistingEmails.includes(GUEST_EMAIL.toLowerCase())) {
      console.log(`Guest ${GUEST_EMAIL} already in booking ${bookingId}`);
      return NextResponse.json({ message: "Guest already added" }, { status: 200 });
    }

    // Add the guest to the booking using the guests endpoint
    try {
      const addGuestResponse = await fetch(`${CAL_API_BASE_URL}/bookings/${uid}/guests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cal-api-version": "2024-08-13",
          Authorization: `Bearer ${CAL_API_KEY}`,
        },
        body: JSON.stringify({
          guests: [
            {
              email: GUEST_EMAIL,
              name: "Mihir",
              timeZone: "America/Los_Angeles",
            },
          ],
        }),
      });

      if (!addGuestResponse.ok) {
        const errorText = await addGuestResponse.text();
        console.error("Failed to add guest:", errorText);

        // Log the error but return success to avoid webhook retries
        return NextResponse.json(
          {
            message: "Booking received but guest addition failed",
            error: errorText,
          },
          { status: 200 },
        );
      }

      const result = await addGuestResponse.json();
      console.log(`Successfully added ${GUEST_EMAIL} to booking ${bookingId}`);

      return NextResponse.json(
        {
          message: "Guest added successfully",
          bookingId,
          guestEmail: GUEST_EMAIL,
          result,
        },
        { status: 200 },
      );
    } catch (apiError) {
      console.error("Error calling Cal.com API:", apiError);
      return NextResponse.json(
        {
          message: "Booking received but API call failed",
          error: apiError instanceof Error ? apiError.message : "Unknown error",
        },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error("Error processing Cal.com webhook:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
};
