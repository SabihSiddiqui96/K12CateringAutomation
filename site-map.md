# Site Map — K12 Catering (app under test)

Claude's memorized model of the app. Read first (Step 5), update last (Step 9).
App base (K12 Catering UI): `https://qak12cateringui.perseusedge.com`
(also seen: `uatk12catering.perseusedge.com` depending on env file).
Login + launch is handled by `utils/helpers.ts` → `loginToK12Catering(page)`;
sidebar nav via `navigateK12CateringMenu(page, '<item>')`.

Left sidebar (`aside[aria-label="Main navigation"]`) items:
Dashboard, Menu, Guest Menu, Orders, Accounts, Reports, Districts,
Address Book, Check Availability, Settings, Notifications,
Manage Notifications, My Profile, Contact Us, What's New?

## Page: Orders (Order Management)
- URL: `/orders`
- Heading: `Order Management`; subtitle "Track and manage all your orders"
- Stat cards (buttons): `Total orders:`, `Accepted orders:`, `Completed orders`, `Total Revenue:`
- Controls: search textbox "Search orders by ID or status"; "Filter orders by status"
  (options: All Status, Accepted, ...); "Toggle date range filter" (Start Date / "Apply date range filter"); sort dropdown
- Order list: `article` cards, each with button "View details for order {ID}",
  fields Event Date / Event Time / Setup Time / Total Amount / Created, and a status
  badge (accepted/completed/delivered/cancelled/pending/processing). Pagination "x-y of N", "Page 1", "Next page".
- Card kebab "More options" → "View Activity"
- "View shopping list for upcoming orders" → Shopping List page
- Notes: list content renders after a short delay — wait for the `Order Management`
  heading and first card before interacting.

## Page: Order Detail
- URL: `/orders/details`
- Heading: `Order#{ID}` (no space), plus `$amount` heading
- Section headings: Order Summary, Payment Contact, Payment Information,
  Order Items, Order Activity, Admin Actions, Options, Order Notes, Quick Navigation
- Buttons: Back to orders, Mark this order as delivered, Cancel this order,
  Print Invoice, Add to Calendar, Download Invoice, Download Order Details,
  **Edit Order**, Add Note. (Admin Actions buttons depend on order status;
  cancelled/terminal orders may show "No actions available for this order status".)
- Order Activity: chronological entries; an edit appends
  `Order edited: Guest count or special instructions updated`.

## Page: Order Editor
- URL: `/orders/edit` (reached via "Edit Order" on the detail page)
- Heading: `Order Editor`
- Collapsible section buttons (each opens a step editor):
  Event Date ("Change the event date"), Setup Time ("Modify setup time"),
  Delivery Contact, Payment Contact, Payment Information,
  Menu Item Order ("Edit menu item quantities and prices"),
  **Guest count and special instructions** ("Update guest count and instructions"),
  Add New Menu Item
- Editing is a 2-step wizard: edit fields → **Next** → "Confirm Changes" step
  ("You are about to update:") → **Confirm Changes** button saves and returns to `/orders/details`.
- Guest count / special instructions fields:
  `#edit-guest-count-input` (number), `#edit-special-instructions-textarea`
- Nav buttons in editor: Back to order details, Back, Next, Confirm Changes

## Page: Shopping List
- Reached from Orders via "View shopping list for upcoming orders"
- Heading contains `Shopping List`; subtitle "Upcoming 7 days inventory planning"
- Stat cards: Total Items, Total Quantity
- Day toggles: "Filter for 7 days" / "Filter for 14 days" (aria-pressed)
- "Shopping List Items" table; "Print shopping list", "Download shopping list as CSV"
- "View all orders" returns to Order Management

## Page: Address Book
- Heading `Address Book`
- "Add your first location" / "Add a new location to your address book"
- Add-location form inputs: `#firstName-input`, `#lastName-input`, `#phoneNumber-input`,
  `#email-input`, `#locationName-input`, `#addressLine1-input`, `#city-input`,
  `#state-select`, `#zipCode-input`; "Save new location"
- Saved location row exposes "Delete {name} location"; delete confirm "Delete and proceed with action"

## Page: Districts (District Management)
- Heading `District Management`; "Add District Group", "Add Environment", "Add District"
- Districts list with status badges; "Search districts..."; sort "Sort by Name"

## Page: Districts — Add District form
- Opened via `Add new district` button on the Districts page
- Fields: `#add-district-name` (text), Multi-Tenant District = **Yes/No radios**
  (role=radio, aria-label "Yes"/"No"; custom/hidden inputs — use `.check({force:true})`),
  `#add-district-group` (**disabled until Multi-Tenant = Yes**; options like
  DBurksGroup1 | Sabih Test | Testing 007), `#add-environment-select`
  (QA (PrimeroEdge) | QA (SchoolCafe) | …), `#add-region-id` (number),
  `#add-timezone-select` (index 0 = "Select timezone…" placeholder),
  `#add-status-select` (Active|Inactive), `#add-require-email-verification` (checkbox)
- Submit: `Add District` button (distinct from `Add new district`); success toast
  matches /district.*created|created.*successfully|success/i
- District rows expose `Delete district {name}` → confirm /Confirm|Yes|Delete/i

## Page: Districts — District Group panel + Edit Group modal
- Each group has an edit button matched by `Edit .*{groupName}` (e.g. `Edit …DBurksGroup1`)
- Edit modal heading `District Group`; `#district-group-name-input` (group name),
  `#district-group-primary-select` (**Primary District** dropdown), `Update`/`Cancel`
- A newly added multi-tenant district assigned to a group appears in that group's
  Primary District dropdown immediately (no full refresh) — verified by T-117613.

## Page: Settings — District Contacts section
- Below the main settings; heading `District Contacts`
- Add control is a button labelled **`Add Contact`** (not "Add new contact")
- Each contact exposes `Edit {name}` and `Delete {name}` buttons
- Shows usage like "(4/5 contact slots used)"

## Page: Data Sync
- Sidebar item `Data Sync`; heading `Data Sync`
- Sub-header: "Push shared catalog from {Primary District} (primary) to opted-in districts"
- `Auto-sync` toggle (role=switch). **The `Sync frequency` `<select>` is `disabled`
  while Auto-sync is Off** — enable Auto-sync first ("Auto-sync settings saved" toast),
  then the dropdown becomes enabled.
- Other controls: `View sync log`, `Push sync now`, Target districts `Manage`,
  `Last sync completed` value, syncable-items table with per-item sync toggles and
  `Reset local overrides`.

## Page: Accounts
- Search textbox "Search accounts by name, username, or email"
- Account card kebab "Actions for {name}" → menuitem "Change Password" → "Change Password" dialog
  (New Password / Confirm Password fields)

## Page: Reports
- URL: `/reports`; heading `Reports`. Reached via `navigateK12CateringMenu(page, 'Reports')`
  or the sidebar `Navigate to Reports` button.
- Renders a grid of report tiles (role=button), each a title + description. Tiles seen:
  Payment Analysis, Order Status Summary, Orders Export, Cancellation Analysis,
  Order Size Analysis, Top Selling Menu Items, Menu Category Performance,
  Customer Order History, Customer Acquisition & Retention, Revenue by Customer,
  Repeat Order Analysis, Account Management, Order Fulfillment Performance,
  Time-Based Analysis, Event & Delivery Schedule, Delivery Performance,
  Location Performance, Order Lead Time Analysis, Allergen Compliance Report.
- Open a report by clicking its tile (`getByRole('button', { name: /<title>/i })`).

## Page: Reports — Payment Analysis
- Reached from Reports by clicking the `Payment Analysis` tile. Heading h1 `Payment Analysis`.
- Section headings: `Summary Statistics`, `Payment Method Usage`,
  `Payment Status Breakdown`, `Outstanding Payments (N)` (N = count).
- Controls: `Export CSV`, `Export PDF`, date-range button `All Time`, `Delivery Date`.
- Three `<table>`s (real tables/`<th>`), told apart by their headers:
  - **Payment Method Usage** — `Payment Method | Count | Amount | Percentage | Average Amount`
    (locate: table with `Payment Method` AND `Percentage` headers).
  - **Payment Status Breakdown** — `Status | Count | Amount | Percentage | Average Amount`.
  - **Outstanding Payments** — `Order # | Customer | Amount | Days Outstanding | Payment Method`
    (locate: table with `Days Outstanding` header).
- The **Payment Method** column (in both the Usage and Outstanding tables) shows, for
  orders paid via **Account String**, the **Payment Display Label** from Settings
  (Settings → `Payment display label`; `Edit accounting string description` button →
  input `#accounting-string-description-input` → `Save Changes` → toast
  `Payment display label saved`). Changing that label updates both tables. Verified by T-117638.

## Launch flow: PrimeroEdge Classic → Catering (rename "K12 Catering" → "Catering")
- PrimeroEdge Classic workspace (`https://qa.primeroedge.co`) Workspace tile is now
  labelled **"Catering"** (was "K12 Catering"). Tile link: `a[href*="K12Catering.aspx"]:visible`.
- Clicking it opens **two tabs at once**:
  - **Interstitial tab** — `https://qa.primeroedge.co/K12Catering/K12Catering.aspx`,
    browser tab title **"PrimeroEdge - Catering"**. Body shows two `Catering` h1
    headings (site title) and the message:
    "You will be automatically authenticated and redirected to Catering in 5 seconds.
    If you are not redirected, please select this [link]". This tab stays put.
  - **Catering app tab** — `https://qak12cateringui.perseusedge.com/login?token=…`
    → redirects to `/dashboard`; browser tab title **"Catering"**; sidebar
    `aside[aria-label="Main navigation"]`.
- Verified by T-116454.

## Site: SchoolCafé (Perseus) — `https://qa.perseusedge.com`
- Separate platform from PrimeroEdge Classic, with its own login. Helper:
  `utils/helpers.ts` → `loginToSchoolCafe(page)` (creds `qaSchoolCafeEmail` /
  encrypted `qaSchoolCafePassword` in `.env`).
- Login page (`/login`): `getByRole('textbox',{name:'Email'})`,
  `getByRole('textbox',{name:'Password'})`, submit button visible text **"SIGN IN"**
  (its accessible name is "button-child", so match by text, not role-name).
- After login: tab title "SchoolCafé - Workspace". Left module rail is `nav` with
  modules rendered as `<div title="…">` (Home, Accountability, Eligibility,
  Account Management, **Catering**, Item Management, Inventory, Menu Planning,
  Production, Financials, Insights, Reports, System). NOTE: there are two `nav`
  elements (module rail + breadcrumb) — scope locators (e.g. `nav [title="Catering"]`).
- The **Catering** module (`nav [title="Catering"]`, was "K12 Catering") shows a
  tooltip **"Catering"** (role=tooltip) on hover. Verified by T-116454.
