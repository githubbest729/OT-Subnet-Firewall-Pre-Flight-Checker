OT Subnet and Firewall Pre-Flight Checker

npm install
npm run dev            local dev server
npm test               logic self-test (CIDR math, overlaps, ports, zone rules, export)
npm run build          installable PWA in dist/ (Service Worker + manifest)
npm run build:preview  single-file HTML without Service Worker in dist-preview/

Deploy dist/ over HTTPS (Service Workers need it), open once online, then Add to Home Screen.
After that it runs fully offline. Data lives in IndexedDB on the device.

src/lib/netmath.ts    step 1: CIDR maths and overlap detection
src/lib/rules.ts      step 2: AVEVA / Modbus port rules, Purdue levels
src/lib/schema.ts     step 3: zone, node, conduit, project types and Dexie DB
src/lib/validate.ts   rule engine (overlaps, addresses, ports, IEC 62443 zone policy)
src/components/       step 4: UI (subnets, topology map, port matrix, pre-flight, export)
src/lib/export.ts     step 5: JSON report and text punch-list
