import { Factuality } from "autoevals";
import { evalite } from "evalite";
import { knowledgeBankPrompt } from "@/lib/ai/prompts";
import { buildMessagesWithMocks, runAIQuery } from "@/tests/evals/support/chat";

const knowledgeBankEntries = [
  "You are a helpful customer support assistant for Epicure Robotics. Epicure builds automation and precision equipment for food production; Epicure Inbox is our team support workspace. Be concise, accurate, and professional.",
  "Standard limited hardware warranty is 12 months from shipment unless your order acknowledgment states otherwise.",
  "RMA returns: unopened spare parts may be returned within 30 days of delivery with an approved RMA. Opened electrical components are final sale unless defective under warranty.",
  "To update the email on your Epicure account, sign in at https://epicurerobotics.com, open Account settings, and change the primary email. Confirm the verification message in both inboxes.",
  "Sales tax: Epicure collects and remits applicable sales tax at checkout based on the ship-to address. Exempt customers should email tax certificates to billing@epicurerobotics.com before placing the order.",
  "Calibration services can be scheduled through support with your serial number and site address; on-site visits require a purchase order for quoted travel time.",
];

const REASONING_ENABLED = true;

evalite("Finding correct information in the knowledge bank", {
  data: () => [
    {
      input: buildMessagesWithMocks({
        messages: [
          {
            id: "1",
            role: "user",
            content: "How long is the hardware warranty from Epicure?",
          },
        ],
        promptRetrievalData: {
          knowledgeBank: knowledgeBankPrompt(knowledgeBankEntries.map((entry) => ({ content: entry }))),
        },
        tools: {},
      }),
      expected:
        "Standard limited hardware warranty is 12 months from shipment unless your order acknowledgment states otherwise.",
    },
    {
      input: buildMessagesWithMocks({
        messages: [
          {
            id: "2",
            role: "user",
            content: "What is your return policy for spare parts?",
          },
        ],
        promptRetrievalData: {
          knowledgeBank: knowledgeBankPrompt(knowledgeBankEntries.map((entry) => ({ content: entry }))),
        },
        tools: {},
      }),
      expected:
        "RMA returns: unopened spare parts may be returned within 30 days of delivery with an approved RMA. Opened electrical components are final sale unless defective under warranty.",
    },
    {
      input: buildMessagesWithMocks({
        messages: [
          {
            id: "4",
            role: "user",
            content: "How do I update my email address on my Epicure account?",
          },
        ],
        promptRetrievalData: {
          knowledgeBank: knowledgeBankPrompt(knowledgeBankEntries.map((entry) => ({ content: entry }))),
        },
        tools: {},
      }),
      expected:
        "To update the email on your Epicure account, sign in at https://epicurerobotics.com, open Account settings, and change the primary email. Confirm the verification message in both inboxes.",
    },
    {
      input: buildMessagesWithMocks({
        messages: [
          {
            id: "5",
            role: "user",
            content: "Does Epicure charge sales tax on orders?",
          },
        ],
        promptRetrievalData: {
          knowledgeBank: knowledgeBankPrompt(knowledgeBankEntries.map((entry) => ({ content: entry }))),
        },
        tools: {},
      }),
      expected:
        "Sales tax: Epicure collects and remits applicable sales tax at checkout based on the ship-to address. Exempt customers should email tax certificates to billing@epicurerobotics.com before placing the order.",
    },
  ],
  task: (input) => runAIQuery(input, REASONING_ENABLED),
  scorers: [Factuality],
});
