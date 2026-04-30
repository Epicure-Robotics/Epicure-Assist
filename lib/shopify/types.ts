export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  orders_count: number;
  total_spent: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyAddress {
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  province_code: string | null;
  country: string | null;
  country_code: string | null;
  zip: string | null;
  name: string | null;
  phone: string | null;
}

export interface ShopifyLineItem {
  id: number;
  variant_id: number | null;
  title: string;
  quantity: number;
  price: string;
  sku: string | null;
  variant_title: string | null;
  vendor: string | null;
  product_id: number | null;
  fulfillment_status: "fulfilled" | "partial" | "unfulfilled" | null;
  name: string;
}

export interface ShopifyFulfillmentEvent {
  id: number;
  order_id: number;
  status: string;
  message: string | null;
  happened_at: string;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  address1: string | null;
  latitude: number | null;
  longitude: number | null;
  shop_id: number;
  created_at: string;
  updated_at: string;
  estimated_delivery_at: string | null;
}

export interface ShopifyFulfillmentEventsResponse {
  fulfillment_events: ShopifyFulfillmentEvent[];
}

export interface ShopifyFulfillment {
  id: number;
  order_id: number;
  status: string;
  created_at: string;
  service: string | null;
  updated_at: string;
  tracking_company: string | null;
  shipment_status: string | null;
  tracking_number: string | null;
  tracking_numbers: string[];
  tracking_url: string | null;
  tracking_urls: string[];
  receipt: Record<string, unknown>;
  line_items: ShopifyLineItem[];
  name: string;
  // Enriched data from events
  delivery_date?: string | null;
  delivery_status?: string | null;
  estimated_delivery_date?: string | null;
  latest_event_date?: string | null;
  latest_event_status?: string | null;
}

export interface ShopifyFulfillmentsResponse {
  fulfillments: ShopifyFulfillment[];
}

export interface ShopifyOrder {
  id: number;
  email: string;
  created_at: string;
  updated_at: string;
  number: number;
  note: string | null;
  token: string;
  total_price: string;
  subtotal_price: string;
  total_weight: number;
  total_tax: string;
  taxes_included: boolean;
  currency: string;
  financial_status: "pending" | "authorized" | "partially_paid" | "paid" | "partially_refunded" | "refunded" | "voided";
  confirmed: boolean;
  total_discounts: string;
  total_line_items_price: string;
  name: string;
  order_number: number;
  processed_at: string;
  fulfillment_status: "fulfilled" | "partial" | "unfulfilled" | null;
  line_items: ShopifyLineItem[];
  shipping_address: ShopifyAddress | null;
  billing_address: ShopifyAddress | null;
  customer: {
    id: number;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  admin_graphql_api_id: string;
  // Enriched fulfillment data
  fulfillments?: ShopifyFulfillment[];
}

export interface ShopifyOrderWithUrl extends ShopifyOrder {
  admin_url: string;
}

export interface ShopifyCustomerSearchResponse {
  customers: ShopifyCustomer[];
}

export interface ShopifyOrdersResponse {
  customer: ShopifyCustomer | null;
  orders: ShopifyOrderWithUrl[];
}

export interface ShopifyCustomerOrdersApiResponse {
  orders: ShopifyOrder[];
}

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}
