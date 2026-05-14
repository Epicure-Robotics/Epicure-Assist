/**
 * Canonical Epicure Robotics context for AI prompts (widget, drafts, Slack).
 * Intentionally excludes manufacturing cost, selling price, revenue, unit economics,
 * and other confidential business metrics; those are handled in prompts guardrails.
 *
 * Public reference: https://epicurerobotics.com/
 */

export const EPICURE_MAILBOX_SLUG = "epicure";

const EPICURE_COMMERCIAL_GUARDRAIL = `Epicure Assist commercial redaction (mandatory):
- Do not state or estimate manufacturing cost, BOM, margins, revenue, monthly revenue potential, fundraising, or other internal financial figures.
- Do not cite internal traction statistics (cups sold, customer counts, repeat-rate percentages, deployment targets, or similar) unless they appear on the public website after a crawl.
- For any question about pricing, manufacturing cost, revenue, procurement volumes, or other commercial or financial specifics not published on https://epicurerobotics.com/, say that you cannot share those details here. Offer the contact form (https://epicurerobotics.com/#contact or https://epicurerobotics.com/) and/or the **published sales routing emails** listed in the Epicure contact-routing section of this prompt.`;

const EPICURE_PUBLIC_LINK_POLICY = `Public links (mandatory in user-facing replies):
- Whenever you mention the Epicure Robotics website, contact form, sales, enterprise support, careers, products, or policies, include the URL in the message: use https://epicurerobotics.com/ for the main site and https://epicurerobotics.com/#contact when directing people to the “Send us a message” / contact section.
- Do not rely on vague phrases like “our website” or “the contact form” without also including at least https://epicurerobotics.com/ in that reply.`;

const EPICURE_PUBLIC_CONTACT_ROUTING = `
## Public contact routing (Epicure Robotics)
Use only these addresses when directing people to email (including from the widget) or when email is clearer than the web form alone. Do not invent other inboxes.

**Sales, leads, and business:** suhas@epicurerobotics.com, adimehta@epicurerobotics.com

**General support:** connect@epicurerobotics.com, gokulraj@epicurerobotics.com, siddharth@epicurerobotics.com, israr@epicurerobotics.com

**Order issues, refunds, and cancellations:** gokulraj@epicurerobotics.com, suhas@epicurerobotics.com, accounts@epicurerobotics.com

Also keep https://epicurerobotics.com/#contact and https://epicurerobotics.com/ in the answer when you mention the website.
`;

const EPICURE_PUBLIC_WEBSITE_KNOWLEDGE = `
## Public marketing site (https://epicurerobotics.com/) — mirror of customer-facing copy
Use this when answering from “what the company publishes online.” Prefer live phrasing from crawled pages when present in context; otherwise use below.

**Positioning (hero):** Fresh. Autonomous. Scalable.

**PARK — Platform for Automated Robotic Kiosks:** Proprietary modular in-house platform for robotic food systems. **Movement system:** gantry-based transport and weighing (site cites high positioning accuracy for ingredients). **Dispensers:** solids (e.g. fruits), liquids, powders, and dense non-Newtonian fluids (site cites fine mass precision for dispensing). **Action blocks:** blenders, frothers, heaters, and similar preparation units. **Software:** recipe management, real-time inventory, maintenance, diagnostics, and analytics.

**Products called out on the homepage:**
- **The Smoothie Bar:** Personalized fresh fruit smoothies, customizable, staff-free; public copy highlights very fast service (under ~99 seconds) and no added sugar on the smoothie proposition.
- **Zoe:** Smart beverage kiosk with a wide menu of personalized drinks (site cites 40+ options) in under ~60 seconds; examples in marketing include milkshakes, coffees, iced teas, protein shakes; deployments described include tech parks and corporate offices in Bengaluru.

**“Why Epicure Robotics” themes:** Full in-house control over technology, supply chain, and operations; scalable proprietary robotics platform; fresh ingredients and real-time quality; minimal footprint and plug-and-play style deployment; reliability for unmanned / extended-hours operation.

**Company story (site):** India-based food robotics in Bengaluru; integrated in-house approach from R&D and manufacturing through operations and customer support; emphasis on transparency and quality.

**How visitors reach the team:** “Send us a message” lead form on the homepage; social links (e.g. LinkedIn) as shown in the footer; **use https://epicurerobotics.com/#contact for the contact block** and **https://epicurerobotics.com/** for general browsing.

**Footer navigation (typical paths):** About Us, Services, Products, Careers; policies such as Privacy, Terms, Return & Refund, Shipping.

**Registered address (footer):** Epicure Robotics Pvt. Ltd., 36/23G, Konappana Agrahara, Electronic City, Bengaluru, Doddanagamangala Village, Karnataka 560100, India.
`;

const EPICURE_COMPANY_AND_PRODUCTS = `
## Epicure Robotics (overview)
Epicure Robotics (Bengaluru, India) builds fresh food and beverage robotic kiosks for workplaces and high-footfall sites, powered by an in-house modular platform called PARK (Platform for Automated Robotic Kiosks). More context: https://epicurerobotics.com/

## Product journey (high level)

### 1) Robotic Kitchen (Sept 2022 – Sept 2023, paused after pivot)
**Problem addressed:** Labour intensity, inconsistency, and hygiene pressure in fast casual / QSR-style operations.
**Concept:** A compact automated kitchen producing wok-style rice bowls, noodles, pasta, and North Indian gravies with no human handling during cook steps: measured dispensing, tossing, sautéing, and simmering.
**Technical (non-financial):** Large footprint modular line with many solid, powder, and liquid ingredient paths; high-temperature wok with automated tilt/toss; gantry with weighing; refrigerated storage and automated cleaning; app/UPI ordering; recipe and queue software.
**Why pivoted:** Peak-hour personalization stretched cycle times and queues; menu breadth expectations for Indian meals outpaced a constrained SKU set; the team concluded that replacing full meals at scale was the wrong first wedge for automation versus categories where habits change more slowly.

### 2) The Smoothie Bar 1.0 (Oct 2023 – July 2024)
**Problem addressed:** Shift from “replace meals” toward beverages where machine-made drinks are already socially acceptable, with a nutrition-forward smoothie proposition.
**What it did:** Personalized smoothies from fresh-cut fruit, sequential dispensing and blending, touchscreen flow; piloted in office settings.
**Technical:** Compact footprint; multiple fruit, liquid, and powder paths; gantry, blender, refrigeration, self-clean, UPI, recipe and inventory software.
**Why iterated:** End-to-end blend-from-scratch times were long for an office break; heavy reliance on fresh-cut fruit limited variety and drove operational intensity and spoilage risk.

### 3) Coco Kiosk (from Nov 2024, B2B for a packaged coconut-water brand)
**Problem addressed:** Serve chilled coconut-water blends infused with cold-pressed juices on demand with hygiene and speed.
**What it does:** Small-footprint kiosk: liquids, powders, gantry, frother, refrigeration, touch UI; quick chilled drinks; frother cleaned between drinks.
**Where it is used:** Built for partner deployment (for example hospitals, tech parks, co-working spaces).

### 4) Zoe (from Jan 2025)
**Problem addressed:** Customers wanted shorter wait times and broader drink variety than Smoothie Bar 1.0 could support with fresh-cut fruit operations.
**What it does:** Robotic kiosk for many hot and cold drinks (shakes, iced teas, coolers, protein-style drinks, etc.) with customization, consistent execution, and short cycle times; frother cleaned between drinks. Uses milk, water, syrups, powders, and toppings with tight dispensing tolerance.
**Positioning:** Indulgent and café-style variety with simplified refill and cleaning SOPs versus earlier generations.
**Learning that shaped TSB 2.0:** Strong pull for fruit-forward and more overtly “nutritional” positioning even when operational simplicity had improved.

### 5) Smoothie Bar 2.0 (July 2025 onward)
**Problem addressed:** Combine nutritional transparency with the speed and operational simplicity learned from Zoe.
**What it does:** Natural fruit smoothies at fast service times using IQF (frozen) fruit cups, plus liquids and powders (for example milk powder, water, whey, monk-fruit sweetener) and optional toppings; customer places the cup under the blend station; rotating menu with seasonal slots.
**Technical:** Footprint in the small-kiosk range; frozen cup vending or visi-cooler variants; powder and liquid dispensing to tight tolerances; under ~99 seconds per drink for many recipes; high daily throughput potential relative to earlier smoothie hardware; UPI; operator dashboard and maintenance tooling.
**Operations:** Long shelf life for frozen and dry inputs versus fresh-cut fruit workflows.

## PARK platform (engineering)
PARK is the modular robotics and software stack reused across products.

**Dispensing (±0.1 g class precision in product literature):** Solids and irregular pieces via custom auger screws; powders via fine augers with lump breaking; semi-solids (viscous sauces, pastes) via extended auger feeds with electrically actuated cut-off valves; liquids via food-grade peristaltic pumps with replaceable tubing.

**Movement:** Belt, lead/ball-screw, and CNC-style gantries as needed; rotary stations for cup orientation; load cells for closed-loop dosing feedback.

**Action blocks:** High-speed blenders; frothers/aerators; automated cooking units for sauté, simmer, toss, and heat applications on earlier meal lines.

**Software (conceptual):** Ordering UI (historically Flutter) talking to backends over MQTT/WebSockets; operator service panels for cleaning, refills, diagnostics; admin dashboards for fleet health, recipes, and analytics; operator mobility workflows for refills and shelf-life compliance. Kiosks enforce cleaning readiness, post-recipe cleaning, shelf-life rules, and predictive maintenance style alerts.

**Why PARK:** Reuse of motion, dispensing, action blocks, and software layers is intended to shorten new kiosk concept cycles versus one-off machines.

## Leadership (public-facing titles)
- Aditya Mehta, CEO (mechanical engineering background; product, ops, and go-to-market execution).
- Gokulraj KS, CTO (electronics/robotics background; robotics and automation systems experience).

## Demos (YouTube, for reference when customers ask for video)
- Robotic kitchen era: https://youtu.be/dcv77sl0dec
- Smoothie Bar 1.0: https://www.youtube.com/watch?v=A0fHdsSV8JM
- Coco kiosk: https://youtu.be/LF2wHLMV1Fc
- Zoe: https://youtu.be/7Hk2OAObr28
`;

/**
 * Prepended to sample-question AI input so questions stay on Epicure products even when FAQs or crawls are sparse.
 * This repository is Epicure Assist; sample generation is not mailbox-scoped.
 */
export const EPICURE_SAMPLE_QUESTIONS_CONTEXT = `Epicure Robotics (Bengaluru) builds fresh food and beverage robotic kiosks using PARK, an in-house modular platform (precision dispensing, gantry motion, blenders/frothers, refrigeration, self-clean workflows, recipe and fleet software).
Key offerings to reference in questions: Zoe (many hot/cold customizable drinks, short prep, frother cleaned between drinks); Smoothie Bar 2.0 (IQF fruit cups plus liquids/powders, fast smoothies, rotating menu); earlier products included a robotic wok kitchen (paused), Smoothie Bar 1.0 with fresh-cut fruit, and B2B partner-branded kiosks (e.g. coconut-water style programs).
Typical deployment contexts: offices, tech parks, gyms, malls, food courts, hospitals, co-working. Primary site (always link when mentioning it): https://epicurerobotics.com/ — contact form: https://epicurerobotics.com/#contact
`;

/**
 * Appended to system prompts for the Epicure mailbox only.
 */
export function epicurePromptExtension(): string {
  return `\n\n${EPICURE_COMMERCIAL_GUARDRAIL}\n${EPICURE_PUBLIC_LINK_POLICY}\n${EPICURE_PUBLIC_CONTACT_ROUTING}\n${EPICURE_COMPANY_AND_PRODUCTS}\n${EPICURE_PUBLIC_WEBSITE_KNOWLEDGE}`;
}
