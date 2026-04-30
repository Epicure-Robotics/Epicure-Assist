import { Body, Head, Html, Markdown, Preview, Text } from "@react-email/components";

type Props = {
  content: string;
};

const AIReplyEmail = ({ content }: Props) => (
  <Html>
    <Head />
    <Preview>{content}</Preview>
    <Body
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
      }}
    >
      <div style={{ fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        <Markdown>{content}</Markdown>
      </div>
      <Text style={{ fontSize: "0.875rem", opacity: 0.6 }}>
        This response was created by our AI support agent. Need human support? Let us know in your reply.
      </Text>
    </Body>
  </Html>
);

AIReplyEmail.PreviewProps = {
  content:
    "Reasons teams choose Epicure automation:\n\n- Consistent portioning and sanitation workflows\n- Local support and spare parts from Epicure Robotics\n- Integration with your existing production line",
} satisfies Props;

export default AIReplyEmail;
