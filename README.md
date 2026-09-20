# OT Subnet and Firewall Pre-Flight Checker

An offline-first web app for field engineers. Draw the network you are about to build, and the app tells you what will break **before** you connect a cable: overlapping subnets, duplicate IPs, blocked AVEVA and Modbus ports, and IEC 62443 zone violations.

**Live app:** https://githubbest729.github.io/OT-Subnet-Firewall-Pre-Flight-Checker/

It is designed for tablets in server rooms: large touch targets, high-contrast red for faults, and no network needed after the first visit.

---

## Contents

1. [What it checks](#what-it-checks)
2. [Quick start](#quick-start)
3. [Using the app](#using-the-app)
4. [Reading the results](#reading-the-results)
5. [Worked example: fix the demo project](#worked-example-fix-the-demo-project)
6. [Install and work offline](#install-and-work-offline)
7. [Your data and backups](#your-data-and-backups)
8. [Reference: rules and ports](#reference-rules-and-ports)
9. [Limits](#limits)
10. [Troubleshooting](#troubleshooting)
11. [For developers](#for-developers)

---

## What it checks

| Area | What the app does |
| --- | --- |
| Subnets and routing | Calculates network, mask, wildcard, broadcast and usable host range from CIDR. Detects overlaps between IT and OT ranges. |
| Addresses | Flags duplicate IPs, addresses outside their zone's subnet, and network or broadcast addresses used as hosts. |
| Industrial ports | Checks that the ports each conduit needs are allowed by the firewall: Modbus/TCP and four AVEVA services. |
| IEC 62443 zones and conduits | Flags direct IT-to-OT traffic with no DMZ, skipped Purdue levels, missing firewalls and security level gaps. |
| Export | Produces a JSON report and a text punch-list of ports to open, plus the IP allocation. |

---

## Quick start

1. Open the app.
2. Tap the project name in the top bar, then **Load demo**. It has seven deliberate faults so you can see how the checker reports problems.
3. Tap **Pre-flight** to read the faults, or follow the [worked example](#worked-example-fix-the-demo-project) to clear them.
4. When you are ready for a real job, tap the project name, then **New project**.

---

## Using the app

The five tabs run left to right in the order you normally work.

### 1. Subnets

A quick calculator for two ranges side by side: the **Corporate IT network** and the **OT production network**.

- Type either `192.168.10.0/24` or an address plus mask such as `192.168.10.0 255.255.255.0`.
- Each card shows the network, mask, wildcard, broadcast, first and last usable address, usable host count and whether the range is private.
- If you type a host address (for example `192.168.10.77/24`) the card tells you the real network is `192.168.10.0/24`.
- A large banner turns **red** with the shared address range when the IT and OT ranges overlap, and **green** when they do not.
- **Add to zone** puts a range straight into a zone you have already created.

Use this tab first, before you commit to an address plan.

### 2. Topology

This is where you describe the design. The map at the top updates as you edit.

**Map**

- Zones sit on horizontal bands, one per Purdue level (L5 at the top, L0 at the bottom).
- Lines with arrows are conduits. The arrow points from the side that starts the traffic to the side that listens.
- A red outline or a dashed red line means a blocking fault. Amber means a warning. Green means the conduit is clean.
- A red number on a zone is how many blocking faults it has.
- Conduits that skip levels run down a lane on the right so they are easy to spot.
- **Tap any zone, device or conduit** to jump to its editor below the map.

**Zones**

A zone is a group of devices with the same security requirements.

1. Pick a Purdue level and tap **Add zone**.
2. Give it a name.
3. Set the target security level (SL 1 to SL 4). This is the IEC 62443 SL-T.
4. Add one or more subnets in CIDR form. Each subnet is checked as you type.

**Devices**

1. Choose the zone and tap **Add device**.
2. Enter a name, device type and IPv4 address. Leave the address blank for unaddressed devices such as an unmanaged switch.
3. Tick the services the device **listens on** (Modbus 502, OPC UA 48031, NMXSVC 5026, Historian 32568, ASB 808). The Ports tab can use this to suggest what a conduit needs.
4. Add your firewalls as devices of type **Firewall**. A conduit can only be assigned to devices of that type.

**Conduits**

A conduit is an allowed path between two zones.

1. Tap **Add conduit** (you need at least two zones).
2. Choose **From** (the side that starts the connection) and **To** (the side that listens). The swap button flips them.
3. Choose the **enforcing firewall**.
4. Optionally add a note, such as an approved exception reference. It appears in the report.

### 3. Ports

This tab decides whether each conduit's firewall rules match what the design needs.

- The **port matrix** at the top gives a quick view: a red cross means required but blocked, a green tick means required and open, an amber tick means open but not required, and a dash means not used.
- Each conduit has a card with the five services. Two switches per service:
  - **Needed**: the design needs this port to pass from the From zone to the To zone.
  - **Firewall allows**: the firewall rule set currently permits it.
- A row turns **red** when a port is needed but not allowed.
- **All ports the firewall allows** is a free-text field. Enter ports, ranges or `any`, separated by commas, for example `502, 5026, 1000-1010`. It stays in sync with the switches.
- **Suggest needed ports from destination devices** ticks Needed for every service that devices in the To zone listen on.
- **Add N missing rules** opens every port that is needed but blocked. Use it to build your punch-list, then apply those rules on the real firewall.

### 4. Pre-flight

The full list of findings, worst first.

- The banner reads **Do not connect cables yet** when there is at least one blocking fault, and **Clear to connect** when there are none.
- Use the filters to show only Blocking, Warnings or Notes.
- Each finding says what is wrong, why it matters and how to fix it. **Open in topology** jumps to the item.
- On wide screens (about 1280 px and up) a **Live results** panel on the right shows the same list while you edit.

### 5. Export

1. Fill in **Project name**, **Site** and **Engineer**. They are printed on the report.
2. Choose an output:
   - **Download JSON**: the full report as data.
   - **Download punch-list**: a plain text file you can print or paste into a change request.
   - **Print or save as PDF**: opens the print dialog with only the report. Choose "Save as PDF" as the destination.
   - **Copy text**: copies the punch-list to the clipboard.

The report contains, in order: the status (APPROVED or NOT APPROVED), the firewall port punch-list, the IP allocation by zone, the conduits, and every finding with its fix. **APPROVED means zero blocking faults.** Warnings do not block approval but are listed.

---

## Reading the results

| Colour | Label | Meaning |
| --- | --- | --- |
| Red | Blocking | The design will not work or breaks a security rule. Fix before connecting. |
| Amber | Warning | Risky or hard to audit, but not certain to fail. Review it, and record an exception in the conduit note if it stays. |
| Blue | Note | Information only, such as an isolated zone or an unrecognised port. |

The status button in the top bar always shows the current count, for example **7 blocking**, and turns green with **Clear to connect** when it reaches zero. Tap it to open the Pre-flight tab.

---

## Worked example: fix the demo project

Load the demo from the project menu. It starts with 7 blocking faults and 2 warnings. Fix them in this order and watch the top bar count fall.

| Step | Where | Change | Blocking faults after |
| --- | --- | --- | --- |
| 0 | | Demo as loaded | 7 |
| 1 | Topology > Zones > Corporate IT | Remove `192.168.20.0/22` and add `10.10.0.0/16`. This clears the IT/OT overlap. | 6 |
| 2 | Topology > Devices > PLC-Labeler | Change `10.20.2.12` to `10.20.1.12` so it sits inside its zone. | 5 |
| 3 | Topology > Devices > PLC-Capper | Change `10.20.1.11` to `10.20.1.13`. This clears the duplicate IP. | 4 |
| 4 | Ports > Platform to HMI | Tap **Add 2 missing rules**. This opens 48031 and 808. | 2 |
| 5 | Topology > Conduits > PLC diagnostics to vendor | Delete it. A PLC must not talk straight to a cloud with no DMZ or firewall. In a real design you would route it through the DMZ instead. | 0 |

The top bar now reads **Clear to connect**. One warning remains (remote desktop 3389 crossing the DMZ boundary) and one note (Vendor cloud has no conduits). Warnings do not block approval.

---

## Install and work offline

Open the app **once while online**. The first visit downloads everything the app needs. After that it works with no network.

- **iPad or iPhone (Safari):** Share, then **Add to Home Screen**.
- **Android or desktop Chrome and Edge:** tap the install icon in the address bar, or the menu, then **Install app**.

To check that offline mode works, turn on airplane mode and reopen the app. Your projects should still load.

When you are online again the app fetches new versions in the background and uses them the next time it starts.

---

## Your data and backups

- Everything is stored **in the browser on your device** (IndexedDB). Nothing is sent to a server.
- Changes save automatically. The top bar shows **Saved on device**. If it shows **Not saved: storage blocked**, the browser is refusing storage, which often happens in private browsing. Use a normal window.
- Projects are listed under the project name in the top bar. You can switch between them or delete them there.
- **Clearing site data in your browser deletes your projects.** Export the report before you do.
- The JSON export is a **report**, not a backup you can re-import. There is no import feature yet.
- Data stays on that one device and browser. It does not sync between a laptop and a tablet.

---

## Reference: rules and ports

### Industrial ports checked

| Service | Port | Protocol |
| --- | --- | --- |
| Modbus/TCP | 502 | TCP |
| AVEVA OPC UA Server / Platform Common Services | 48031 | TCP |
| AVEVA NMXSVC / Platform Communications | 5026 | TCP |
| AVEVA Historian real-time service | 32568 | TCP |
| AVEVA ASBAuthentication Service | 808 | TCP |

These follow the project specification. Confirm them against the firewall documentation for the AVEVA System Platform version installed on site. To change or add services, edit `src/lib/rules.ts`.

### Purdue levels

| Level | Meaning | Domain |
| --- | --- | --- |
| 5 | Enterprise / cloud | IT |
| 4 | Site business (corporate IT) | IT |
| 3.5 | Industrial DMZ | DMZ |
| 3 | Site operations | OT |
| 2 | Area supervisory (HMI) | OT |
| 1 | Basic control (PLC) | OT |
| 0 | Process / field I/O | OT |

### Every check

| Category | Check | Severity |
| --- | --- | --- |
| Subnet | Invalid CIDR in a zone | Blocking |
| Subnet | Two different zones overlap (labelled "IT / OT" when one side is IT and the other OT) | Blocking |
| Subnet | Two subnets inside the same zone overlap | Warning |
| Subnet | Zone has no subnet | Warning |
| Address | Device IP is not a valid IPv4 address | Blocking |
| Address | Device IP is outside every subnet of its zone | Blocking |
| Address | Device uses the network or broadcast address | Blocking |
| Address | Two devices share an IP | Blocking |
| Zones | IT and OT connected directly with no DMZ | Blocking |
| Zones | Conduit skips one or more Purdue levels | Warning |
| Zones | No firewall on a conduit that crosses OT, DMZ and IT | Blocking |
| Zones | No firewall on a conduit inside the same domain | Warning |
| Zones | Assigned enforcement device is not a firewall | Blocking |
| Zones | Conduit points at a deleted zone | Blocking |
| Zones | Security level targets differ by 2 or more | Warning |
| Zones | Conduit starts and ends in the same zone | Warning |
| Zones | Zone has no conduits | Note |
| Ports | A needed service port is not allowed | Blocking |
| Ports | Firewall allows any port | Blocking |
| Ports | Firewall opens a port range | Warning |
| Ports | Risky port (21, 23, 135, 139, 445, 3389, 5900) crosses an IT/DMZ/OT boundary | Warning |
| Ports | Service port is open but not marked needed | Note |
| Ports | Destination zone hosts a service the conduit does not list | Note |
| Ports | Open port not in the built-in rule set | Note |

---

## Limits

- The app checks **the design you enter**. It does not scan a live network or read a firewall's configuration.
- IPv4 only. The port rules cover TCP services as listed above.
- Traffic is checked in one direction, From to To. It assumes the firewall is stateful and allows replies.
- NAT is not modelled. An overlap is always reported, even if you plan to translate addresses. Record the exception in the conduit note.
- The report is a planning aid. It does not replace a security review or a formal IEC 62443 assessment.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| White page on GitHub Pages | In repository **Settings > Pages**, set **Source** to **GitHub Actions**. "Deploy from a branch" serves the unbuilt source, which cannot run. Then run the **Deploy to GitHub Pages** workflow. |
| Assets return 404 | The base path must match the repository name. See `REPO_BASE` in `vite.config.ts`. |
| App does not load offline | Open it once while online, on HTTPS, and let it finish loading. Then reopen it offline. |
| An old version shows after an update | Close every tab and window of the app and open it again, or hard refresh with Ctrl+Shift+R. |
| "Not saved: storage blocked" | Leave private browsing, or allow site data for the page. |
| Projects disappeared | Site data was cleared in the browser. Use the export before clearing data. |
| `[WindowMode]` message in the console | It comes from a browser extension, not this app. Ignore it. |

---

## For developers

### Commands

```bash
npm install          # install dependencies
npm run dev          # local dev server
npm test             # logic self-test: CIDR math, overlaps, ports, zone rules, export
npm run build        # type-check, then build the installable PWA into dist/
npm run build:preview  # single-file HTML with no Service Worker, into dist-preview/
```

### Stack

React 19 and Vite, Tailwind CSS v4 (configured with `@import "tailwindcss"` in `src/index.css` and the `@tailwindcss/vite` plugin, so no `tailwind.config.js` or `postcss.config.js` is needed), Zustand for state, Dexie for IndexedDB, `vite-plugin-pwa` for the Service Worker and manifest, and Lucide for icons.

### Project layout

```
src/lib/netmath.ts     Step 1  CIDR maths and overlap detection
src/lib/rules.ts       Step 2  AVEVA and Modbus port rules, Purdue levels
src/lib/schema.ts      Step 3  zone, node, conduit and project types, Dexie database, demo project
src/lib/ports.ts               port range parsing and helpers
src/lib/validate.ts            rule engine: overlaps, addresses, ports, IEC 62443 zone policy
src/lib/export.ts      Step 5  JSON report and text punch-list
src/lib/selftest.ts            tests run by npm test
src/store.ts                   Zustand store, saves to IndexedDB
src/components/                Step 4  UI: Calculator, TopologyMap, Topology, Ports, Dashboard, ExportView
```

### Deploy to GitHub Pages

1. Put `.github/workflows/deploy.yml` in the repository. It runs `npm ci`, `npm run build` and publishes `dist/`.
2. In **Settings > Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow by hand from the **Actions** tab.

GitHub Pages serves a project site from `/<repository-name>/`, so `vite.config.ts` sets the production base path to `/OT-Subnet-Firewall-Pre-Flight-Checker/`. Change `REPO_BASE`, or set the `BASE_PATH` environment variable, if you rename the repository or use a custom domain. Update the URLs in `index.html` as well.

Service Workers need HTTPS, or `localhost` during development.

### Add a service or a rule

- New port: add an entry to `SERVICES` in `src/lib/rules.ts`. The Ports tab, the validator and the export pick it up automatically. Add its id to the `ServiceId` type.
- New risky port: add it to `RISKY_PORTS` in the same file.
- New check: add it to `validateProject` in `src/lib/validate.ts` and cover it in `src/lib/selftest.ts`.
