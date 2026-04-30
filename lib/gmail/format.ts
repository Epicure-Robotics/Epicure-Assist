const sanitizeHeaderValue = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export const formatGmailFromAddress = (address: string, displayName?: string | null) => {
  const safeAddress = sanitizeHeaderValue(address ?? "");
  if (!safeAddress) {
    return address;
  }

  const safeName = displayName ? sanitizeHeaderValue(displayName) : "";
  if (!safeName) {
    return safeAddress;
  }

  if (safeAddress.includes("<") && safeAddress.includes(">")) {
    return safeAddress;
  }

  const escapedName = safeName.replace(/"/g, '\\"');
  return `"${escapedName}" <${safeAddress}>`;
};
