import { ChevronDown, ChevronRight, ExternalLink, Package, Truck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ShopifyOrder, ShopifyOrderWithUrl } from "@/lib/shopify/types";
import { cn } from "@/lib/utils";

interface ShopifyOrderItemProps {
  order: ShopifyOrderWithUrl;
  initialExpanded?: boolean;
}

// Format Shopify price (already a decimal string like "99.00") with currency
const formatShopifyPrice = (price: string, currency = "USD"): string => {
  const amount = parseFloat(price);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const getFinancialStatusColor = (status: ShopifyOrder["financial_status"]) => {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
    case "partially_paid":
      return "default";
    case "refunded":
    case "partially_refunded":
    case "voided":
      return "destructive";
    case "authorized":
      return "success";
    default:
      return "gray";
  }
};

const getFulfillmentStatusColor = (status: ShopifyOrder["fulfillment_status"]): "success" | "default" | "gray" => {
  switch (status) {
    case "fulfilled":
      return "success";
    case "partial":
      return "default";
    case "unfulfilled":
    case null:
    default:
      return "gray";
  }
};

const formatStatus = (status: string) => {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getCountryColor = (country: string | null) => {
  if (!country) return "";
  switch (country) {
    case "United Kingdom":
      return "text-indigo-600 dark:text-indigo-400 font-bold";
    case "Canada":
      return "text-red-600 dark:text-red-400 font-bold";
    case "United States":
      return "text-blue-600 dark:text-blue-400 font-bold";
    case "Australia":
      return "text-emerald-600 dark:text-emerald-400 font-bold";
    default:
      return "";
  }
};

const formatExactDate = (dateString: string): string => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear().toString().slice(-2);
  return `${day}-${month}-${year}`;
};

export const ShopifyOrderItem = ({ order, initialExpanded = true }: ShopifyOrderItemProps) => {
  const [expanded, setExpanded] = useState(initialExpanded);

  return (
    <div className="text-muted-foreground transition-colors hover:text-foreground group py-2 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-1">
        <button
          className="flex items-center justify-center w-5 h-5 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground mt-0.5 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-2">
              <a
                href={order.admin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-foreground hover:underline flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                Order #{order.order_number}
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
              <Badge
                variant={getFinancialStatusColor(order.financial_status)}
                className="text-[10px] px-1.5 py-0 h-4 leading-none uppercase tracking-tight"
              >
                {formatStatus(order.financial_status)}
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground font-medium">{formatExactDate(order.created_at)}</div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-foreground">
              {formatShopifyPrice(order.total_price, order.currency)}
            </span>
            {order.shipping_address?.country && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span className={cn("text-muted-foreground", getCountryColor(order.shipping_address.country))}>
                  {order.shipping_address.country}
                </span>
              </>
            )}
            {order.fulfillment_status && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span
                  className={cn(
                    "font-medium",
                    order.fulfillment_status === "fulfilled"
                      ? "text-green-600 dark:text-green-500"
                      : "text-muted-foreground",
                  )}
                >
                  {formatStatus(order.fulfillment_status)}
                </span>
              </>
            )}
            {order.fulfillments && order.fulfillments.length > 0 && !expanded && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span className="text-muted-foreground flex items-center gap-0.5">
                  <Truck className="h-3 w-3" />
                  {order.fulfillments.length} shipment{order.fulfillments.length > 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>

          {expanded && (
            <div className="mt-4 space-y-4 border-l-2 border-muted pl-3 ml-0.5 pb-1">
              {/* Fulfillment Information */}
              {order.fulfillments && order.fulfillments.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-2 flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    Fulfillment
                  </div>
                  <div className="space-y-3">
                    {order.fulfillments.map((fulfillment) => (
                      <div
                        key={fulfillment.id}
                        className="text-xs space-y-1.5 bg-muted/30 p-2 rounded-md border border-border/50"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Badge variant="gray" className="text-[10px] px-1 py-0 h-4 uppercase tracking-tight">
                            {formatStatus(fulfillment.status)}
                          </Badge>
                          {fulfillment.tracking_number &&
                            (fulfillment.tracking_url ? (
                              <a
                                href={fulfillment.tracking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary hover:underline font-mono text-[10px] flex items-center gap-1"
                              >
                                {fulfillment.tracking_company}: {fulfillment.tracking_number}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground font-mono text-[10px]">
                                {fulfillment.tracking_company}: {fulfillment.tracking_number}
                              </span>
                            ))}
                        </div>
                        {fulfillment.delivery_date ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Delivered:</span>
                            <span className="font-semibold text-foreground">
                              {formatExactDate(fulfillment.delivery_date)}
                            </span>
                            <Badge variant="success" className="text-[10px] px-1 py-0 h-4">
                              {fulfillment.delivery_status || "Delivered"}
                            </Badge>
                          </div>
                        ) : fulfillment.latest_event_date ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground">Last Update:</span>
                              <span className="font-semibold text-foreground">
                                {formatExactDate(fulfillment.latest_event_date)}
                              </span>
                              {fulfillment.latest_event_status && (
                                <Badge variant="default" className="text-[10px] px-1 py-0 h-4">
                                  {fulfillment.latest_event_status}
                                </Badge>
                              )}
                            </div>
                            {fulfillment.estimated_delivery_date && (
                              <div className="text-[10px] text-muted-foreground italic pl-1">
                                Estimated delivery: {formatExactDate(fulfillment.estimated_delivery_date)}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Line Items */}
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-2 flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Items ({order.line_items.length})
                </div>
                <div className="space-y-3">
                  {order.line_items.map((item) => (
                    <div key={item.id} className="text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-foreground leading-tight">
                            {item.name.replace("-", "").trim()}
                          </div>
                          {item.sku && (
                            <div className="text-muted-foreground/70 text-[10px] mt-0.5 font-mono">SKU: {item.sku}</div>
                          )}
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <div className="text-muted-foreground text-[11px]">
                            {item.quantity} × {formatShopifyPrice(item.price, order.currency)}
                          </div>
                          <div className="font-semibold text-foreground mt-0.5">
                            {formatShopifyPrice((parseFloat(item.price) * item.quantity).toFixed(2), order.currency)}
                          </div>
                        </div>
                      </div>
                      {item.fulfillment_status && item.fulfillment_status !== "fulfilled" && (
                        <div className="mt-1">
                          <Badge
                            variant={getFulfillmentStatusColor(item.fulfillment_status)}
                            className="text-[9px] px-1 py-0 h-3.5 uppercase tracking-tight"
                          >
                            {formatStatus(item.fulfillment_status)}
                          </Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Totals */}
              <div className="text-xs space-y-1.5 border-t border-border/50 pt-3">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatShopifyPrice(order.subtotal_price, order.currency)}</span>
                </div>
                {parseFloat(order.total_tax) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span>{formatShopifyPrice(order.total_tax, order.currency)}</span>
                  </div>
                )}
                {parseFloat(order.total_discounts) > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-500 font-medium">
                    <span>Discount</span>
                    <span>-{formatShopifyPrice(order.total_discounts, order.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-foreground text-sm border-t border-border/50 pt-2 mt-1">
                  <span>Total</span>
                  <span>{formatShopifyPrice(order.total_price, order.currency)}</span>
                </div>
              </div>

              {/* Order Note */}
              {order.note && (
                <div className="text-xs border-t border-border/50 pt-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1.5">
                    Order Note
                  </div>
                  <div className="text-muted-foreground bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-100 dark:border-amber-900/30 italic">
                    "{order.note}"
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
