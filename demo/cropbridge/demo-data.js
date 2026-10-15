// Fabricated demo data. No real companies, no real customs/trade data, no live calls.
// Structure and field names mirror the real app's actual components (Dashboard,
// DataDashboard, FindSuppliers, CompanyProfile, Subscription), read directly from
// its source, so this demo represents the real product's real screens.

const USER = { name: "Demo User", initial: "D" };

let tokenBalance = 7;

const HS_TREE = [
  { code: "1702.3000", name: "Dextrose", category: "Sweeteners" },
  { code: "3102.1000", name: "Urea 46%", category: "Fertilizers" },
  { code: "3904.1000", name: "PVC Resin", category: "Plastics & Polymers" }
];

const COMPANIES = [
  {
    id: "c1", name: "Meridian AgroTrade Ltd.", country: "Brazil", sector: "Sweeteners",
    type: "Manufacturer", legal_name: "Meridian AgroTrade Industria e Comercio Ltda.",
    district: "Sao Paulo", province: "Sao Paulo State", established: 2011, employees: "250-500",
    website: "meridianagrotrade.example.com", verified: true, has_key_contacts: true,
    products: [{ name: "Dextrose Monohydrate", variety: "Food grade", value_added: false }, { name: "Dextrose Anhydrous", variety: "Pharma grade", value_added: true }],
    avg_price: "$742/MT", volume: "4,120 MT", shipments: 38, avg_shipment: "108 MT", last_active: "2026-06-28",
    contacts: [
      { id: "k1", name: "Elena Marsh", designation: "Head of Export Sales", is_public: false, unlocked: false, phone: "+55 11 4820-1187", email: "e.marsh@meridianagrotrade.example.com", whatsapp: "+55 11 98820-1187" },
      { id: "k2", name: "Rui Tanaka", designation: "Managing Director", is_public: false, unlocked: false, phone: "+55 11 4820-1001", email: "r.tanaka@meridianagrotrade.example.com", whatsapp: null }
    ]
  },
  {
    id: "c2", name: "Cascade Commodities Group", country: "Brazil", sector: "Sweeteners",
    type: "Trading House", legal_name: "Cascade Commodities Group S.A.",
    district: "Santos", province: "Sao Paulo State", established: 2005, employees: "50-100",
    website: "cascadecommodities.example.com", verified: true, has_key_contacts: true,
    products: [{ name: "Dextrose Monohydrate", variety: null, value_added: false }],
    avg_price: "$768/MT", volume: "2,860 MT", shipments: 21, avg_shipment: "136 MT", last_active: "2026-06-30",
    contacts: [
      { id: "k3", name: "Priya Nair", designation: "Procurement Manager", is_public: true, unlocked: true, phone: "+55 13 3271-4420", email: "p.nair@cascadecommodities.example.com", whatsapp: "+55 13 99271-4420" }
    ]
  },
  {
    id: "c3", name: "Sable Harvest Exports", country: "Brazil", sector: "Sweeteners",
    type: "Exporter", legal_name: "Sable Harvest Exports Ltda.",
    district: "Ribeirao Preto", province: "Sao Paulo State", established: 2016, employees: "10-50",
    website: null, verified: false, has_key_contacts: true,
    products: [{ name: "Dextrose Monohydrate", variety: "Food grade", value_added: false }],
    avg_price: "$791/MT", volume: "1,530 MT", shipments: 12, avg_shipment: "128 MT", last_active: null,
    contacts: [
      { id: "k4", name: "Owner / Founder", designation: "Founder & CEO", is_public: false, unlocked: false, phone: "+55 16 3610-2299", email: "founder@sableharvest.example.com", whatsapp: null }
    ]
  },
  {
    id: "c4", name: "Northgate Chemical Traders", country: "Pakistan", sector: "Fertilizers",
    type: "Trading House", legal_name: "Northgate Chemical Traders (Pvt) Ltd.",
    district: "Karachi", province: "Sindh", established: 2009, employees: "100-250",
    website: "northgatechemical.example.com", verified: true, has_key_contacts: true,
    products: [{ name: "Urea 46%", variety: "Prilled", value_added: false }],
    avg_price: "$318/MT", volume: "9,400 MT", shipments: 54, avg_shipment: "174 MT", last_active: "2026-07-02",
    contacts: [
      { id: "k5", name: "Ahsan Raza", designation: "Sales Director", is_public: false, unlocked: false, phone: "+92 21 3532-1180", email: "a.raza@northgatechemical.example.com", whatsapp: "+92 300 8321180" }
    ]
  }
];

const SUBSCRIPTION_PLANS = [
  { id: "starter", name: "Starter", tokens: 20, period: "per month", price: "$29/mo", features: { "Unlimited search": true, "Contact unlocks": "20 tokens included", "Watchlist": true, "Export to CSV": false }, popular: false },
  { id: "growth", name: "Growth (Popular)", tokens: 75, period: "per month", price: "$79/mo", features: { "Unlimited search": true, "Contact unlocks": "75 tokens included", "Watchlist": true, "Export to CSV": true, "Trade Ledger access": true }, popular: true },
  { id: "enterprise", name: "Enterprise", tokens: 300, period: "per month", price: "$249/mo", features: { "Unlimited search": true, "Contact unlocks": "300 tokens included", "Watchlist": true, "Export to CSV": true, "Trade Ledger access": true, "Priority support": true }, popular: false }
];

// Counts of this demo's own data: shipments across COMPANIES, the companies, HS_TREE products.
const STATS = { records: "125", companies: "4", products: "3" };
