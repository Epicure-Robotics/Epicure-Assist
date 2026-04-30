import { Body, Head, Html, Preview, Text } from "@react-email/components";
import { getBaseUrl } from "@/components/constants";

const OtpEmail = ({ otp }: { otp: string }) => (
  <Html>
    <Head />
    <Preview>Your login code is {otp}</Preview>
    <Body
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
      }}
    >
      <Text>
        Your login code for <a href={getBaseUrl()}>{getBaseUrl()}</a> is:
      </Text>
      <Text style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{otp}</Text>
    </Body>
  </Html>
);

OtpEmail.PreviewProps = {
  otp: "123456",
};

export default OtpEmail;
