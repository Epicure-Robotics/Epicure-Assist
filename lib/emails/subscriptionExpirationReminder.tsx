import { Body, Head, Hr, Html, Preview, Text } from "@react-email/components";
import * as React from "react";

type Props = {
  displayName: string | null;
  email: string;
  expiresAt: string;
};

const SubscriptionExpirationReminderEmail = ({ displayName, email, expiresAt }: Props) => {
  const userName = displayName || email;
  const expirationDate = new Date(expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Html>
      <Head />
      <Preview>Action Required: Cancel your store subscription to avoid double charges</Preview>
      <Body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
          backgroundColor: "#f9fafb",
          padding: "20px",
        }}
      >
        <div
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            padding: "32px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
        >
          <Text style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem", color: "#111827" }}>
            Action Required: Cancel Your Store Subscription
          </Text>

          <Text style={{ fontSize: "1rem", lineHeight: "1.5", color: "#374151" }}>Hi {userName},</Text>

          <Text style={{ fontSize: "1rem", lineHeight: "1.5", color: "#374151" }}>
            We noticed that you purchased a subscription through our website and also have an active paid subscription
            from the App Store or Play Store.
          </Text>

          <div
            style={{
              background: "#fee2e2",
              padding: "20px",
              borderRadius: "8px",
              borderLeft: "4px solid #dc2626",
              margin: "24px 0",
            }}
          >
            <Text style={{ margin: "0 0 8px", fontSize: "0.9375rem", color: "#991b1b", fontWeight: "600" }}>
              ⚠️ Important: You Have Two Active Subscriptions
            </Text>
            <Text style={{ margin: "0", fontSize: "0.875rem", color: "#991b1b", lineHeight: "1.5" }}>
              Since you bought a subscription from our website, you don't need the App Store or Play Store subscription.
              Please cancel your store subscription before <strong>{expirationDate}</strong> to avoid being charged
              twice.
            </Text>
          </div>

          <div
            style={{
              background: "#f3f4f6",
              padding: "16px",
              borderRadius: "6px",
              margin: "24px 0",
            }}
          >
            <Text style={{ margin: "8px 0", fontSize: "0.875rem", color: "#374151" }}>
              <strong>Account:</strong> {email}
            </Text>
            <Text style={{ margin: "8px 0", fontSize: "0.875rem", color: "#374151" }}>
              <strong>Active Subscriptions:</strong>
            </Text>
            <Text style={{ margin: "4px 0 4px 20px", fontSize: "0.8125rem", color: "#4b5563" }}>
              • Pro (Web) - Active ✓
            </Text>
            <Text style={{ margin: "4px 0 8px 20px", fontSize: "0.8125rem", color: "#4b5563" }}>
              • Pro (App Store/Play Store) - Cancel before {expirationDate}
            </Text>
          </div>

          <div
            style={{
              background: "#eff6ff",
              padding: "20px",
              borderRadius: "8px",
              margin: "24px 0",
              borderLeft: "4px solid #3b82f6",
            }}
          >
            <Text style={{ margin: "0 0 12px", fontSize: "0.875rem", fontWeight: "600", color: "#1e40af" }}>
              How to Cancel Your Subscription:
            </Text>

            <div style={{ marginBottom: "16px" }}>
              <Text style={{ margin: "0 0 8px", fontSize: "0.875rem", fontWeight: "600", color: "#374151" }}>
                📱 For iPhone/iPad:
              </Text>
              <Text style={{ margin: "0 0 4px 16px", fontSize: "0.8125rem", color: "#4b5563" }}>
                1. Open Settings app
              </Text>
              <Text style={{ margin: "0 0 4px 16px", fontSize: "0.8125rem", color: "#4b5563" }}>
                2. Tap your name at the top
              </Text>
              <Text style={{ margin: "0 0 4px 16px", fontSize: "0.8125rem", color: "#4b5563" }}>
                3. Tap Subscriptions
              </Text>
              <Text style={{ margin: "0 0 4px 16px", fontSize: "0.8125rem", color: "#4b5563" }}>
                4. Select your Pro subscription
              </Text>
              <Text style={{ margin: "0 16px", fontSize: "0.8125rem", color: "#4b5563" }}>
                5. Tap Cancel Subscription
              </Text>
            </div>

            <div>
              <Text style={{ margin: "0 0 8px", fontSize: "0.875rem", fontWeight: "600", color: "#374151" }}>
                🤖 For Android:
              </Text>
              <Text style={{ margin: "0 0 4px 16px", fontSize: "0.8125rem", color: "#4b5563" }}>
                1. Open Google Play Store
              </Text>
              <Text style={{ margin: "0 0 4px 16px", fontSize: "0.8125rem", color: "#4b5563" }}>
                2. Tap Menu → Subscriptions
              </Text>
              <Text style={{ margin: "0 0 4px 16px", fontSize: "0.8125rem", color: "#4b5563" }}>
                3. Select your Pro subscription
              </Text>
              <Text style={{ margin: "0 16px", fontSize: "0.8125rem", color: "#4b5563" }}>
                4. Tap Cancel Subscription
              </Text>
            </div>
          </div>

          <Text style={{ fontSize: "0.875rem", lineHeight: "1.5", color: "#6b7280", marginTop: "24px" }}>
            Your subscription from our website will continue, so you'll still have full Pro access. By canceling your
            store subscription, you'll avoid being charged twice while keeping all your Pro benefits.
          </Text>

          <Text style={{ fontSize: "0.875rem", lineHeight: "1.5", color: "#6b7280" }}>
            If you have any questions or need help canceling, please don't hesitate to reach out to our support team.
          </Text>

          <Hr style={{ margin: "32px 0", borderColor: "#e5e7eb" }} />

          <Text style={{ fontSize: "0.75rem", color: "#9ca3af", lineHeight: "1.5" }}>
            You're receiving this email because we detected duplicate subscriptions on your account. If you have any
            questions, please contact our support team.
          </Text>
        </div>
      </Body>
    </Html>
  );
};

SubscriptionExpirationReminderEmail.PreviewProps = {
  displayName: "John Doe",
  email: "john@example.com",
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
} satisfies Props;

export default SubscriptionExpirationReminderEmail;
