// Prices, shipping and order statuses: the one place to change them.
// Prices are checked on the server, so a customer can't change what they pay.
export const SIZES = {
  mini:    { name: 'Mini',      mm: 150, price: 59 },
  classic: { name: 'Classic',   mm: 200, price: 99 },
  sig:     { name: 'Signature', mm: 250, price: 150 },
};

// Flat rates, Australia-wide (launch plan: A$15 standard plus an express option; adjust after weighing a packed box)
export const SHIPPING = [
  { id: 'standard', name: 'Standard post (Australia Post)', amount: 15, min_days: 3, max_days: 8 },
  { id: 'express',  name: 'Express post (Australia Post)',  amount: 25, min_days: 1, max_days: 3 },
];
export const MAKE_DAYS = 14;          // "made and shipped within 14 days"
export const AUTO_APPROVE_DAYS = 3;   // no reply to the order confirmation = approved

export const FONTS = ['Sora', 'Barlow Condensed', 'Roboto Slab', 'Nunito'];

// Order life: paid orders start at "new". Requests (fully custom, unpaid) sit at "request".
export const STATUSES = {
  pending_payment:   { label: 'Awaiting payment', you: false },
  request:           { label: 'Custom request',   you: true  },
  new:               { label: 'New',              you: true  },
  preview_sent:      { label: 'Preview sent',     you: false },
  changes_requested: { label: 'Changes requested', you: true },
  approved:          { label: 'Approved',         you: true  },
  printing:          { label: 'Printing',         you: true  },
  packed:            { label: 'Packed',           you: true  },
  shipped:           { label: 'Shipped',          you: false },
  delivered:         { label: 'Delivered',        you: false },
  cancelled:         { label: 'Cancelled',        you: false },
};
