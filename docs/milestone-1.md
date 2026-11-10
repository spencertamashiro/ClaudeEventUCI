# Milestone 1 design

## Architecture

Vite serves a mobile-first React/TypeScript app. MapLibre draws a contextual Irvine basemap and a separate synthetic practice map. A repository interface loads versioned GeoJSON and JSON rules; the UI passes the repository's data, device, traversal mode and instant to a pure evaluator. PostGIS can later implement the same repository contract through a server API.

- `public/data/v1/{irvine,demo}/` holds versioned geometry and rule bundles.
- `src/domain.ts` defines the contract; `src/rules.ts` evaluates access and speed.
- `src/repository.ts` loads snapshots; `src/RideMap.tsx` renders them.
- `src/App.tsx` owns selectors, evidence details, review queue and correction export.
- `tests/` exercises time, rule and topology behavior.

## Proposed schema

A snapshot has a version, mode, feature collection, rules, sources and review issues. Features have stable IDs, names, types, geometry provenance and optionally separate roadway and estimated travel speeds. Network segments can also carry explicit from/to node IDs, grade level and direction. An intersection is represented by shared node identity. An XY crossing alone creates no connection.

A rule references segment and source IDs and specifies device profiles, access or rider speed, effective interval, Pacific weekly schedule, exceptions, coverage of walking, and review status. Source records include authority, URL and last verification date. Unknown values remain null or absent. Published intervals are start-inclusive/end-exclusive. Explicit conflict records and competing active access outcomes produce unverified results. A verified total closure supersedes ordinary access when uncontested. Independent applicable speed caps combine by minimum. An absent access rule yields unverified; absent speed stays unknown. Local time inputs must resolve to a unique instant or explicitly select an offset during fall-back.

## Source inventory · reviewed November 9, 2026

| Source / authority | Observed claim or terms | Applicability and review |
| --- | --- | --- |
| [UCI Housing undergraduate policies](https://housing.uci.edu/policies/undergraduate/) | Bicycle riding restriction on Ring Mall Mon–Fri 08:30–17:00 and an 8 mph campus/housing reference. | Confirm device-specific scope, controlling policy, management limits and mapped endpoints. |
| [UCI Transportation bike and scooter safety](https://www.bike.uci.edu/general-info/bicycle-safety-and-operation/) and [UCI pathway guidance](https://www.bike.uci.edu/general-info/pedestrian-safety/) | Ring Mall restriction hours appear without weekday qualification; e-scooter guidance distinguishes the campus core. | Schedule and device scope are unresolved across summaries. An omitted weekday qualifier alone does not prove a weekend ban. Confirm boundaries, signs and Policy 904-13; the [policy text](https://policies.uci.edu/policies/procs/904-13/) returned a gateway error. |
| [Irvine Police scooter guidance](https://irvinepd.gov/2025/05/01/electric-scooter-safety/) | Reports a 15 mph motorized-scooter maximum and sidewalk restriction. | Confirm current [Vehicle Code §22411](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=22411.) and applicable facility exceptions; direct statute fetch returned 403. |
| [City shared-use path handout](https://legacy.cityofirvine.org/civica/filebank/blobdload.asp?BlobID=34210), [2026 city staff draft](https://irvine.granicus.com/MetaViewer.php?event_id=2764&meta_id=179864&view_id=) and [OC Parks rules](https://parks.oc.gov/e-bikes) | City handout describes Class 3 restrictions; county guidance distinguishes Class 1/2 on its regional paved bikeways. City draft is evidence of proposed changes. | Verify enacted city code, dates, facility ownership and jurisdiction by segment before reconciling. County guidance alone cannot decide city or campus access. |
| [Signed Irvine Council minutes, item 2.7](https://irvine.granicus.com/MetaViewer.php?event_id=2789&meta_id=181575&view_id=68) and [second-reading packet](https://irvine.granicus.com/MetaViewer.php?event_id=2774&meta_id=180549&view_id=) | Council adopted Ordinance 26-05 on February 10, 2026. The packet specifies 20 mph for bicycles and e-bikes on bicycle paths and trails, subject to reasonable and prudent speed. | Confirm current codification, ownership, and which segments and exceptions the ordinance covers. No operational segment rule was created. |
| [UCI campus map](https://ce.uci.edu/uci/media/Documents/campus-map.pdf) and [Irvine bikeways](https://legacy.cityofirvine.org/cityhall/pw/itn_new/biking/biking.asp) | Candidate inventories for campus, housing, UTC connections, bikeways and parking. | Obtain reusable GIS and verify UTC property boundaries, parking, posted notices and closures. No geometry copied. |
| [OpenFreeMap public service](https://openfreemap.org/quick_start/) and [OpenStreetMap license](https://www.openstreetmap.org/copyright) | Public basemap with attribution. | Context only. No features are extracted or promoted to access evidence. Camera starts near [Aldrich Park](https://commons.wikimedia.org/wiki/File:Aldrich_Park%2C_UCI.jpg). |

No accompanying research file was present in the checkout. Published claims are distinguished from verified segment-level applicability. Initial production overlay has zero promoted features or rules.

## Phases and acceptance

1. Deliver real context and fictional practice views, five devices, live and departure clocks, clickable and keyboard-accessible segments, schedules and provenance, four labeled outcomes, gaps and local correction export. Build and run tests.
2. Obtain reusable GIS, confirm jurisdiction, active rules, signs and closure feeds; promote only audited geometry/rule pairs. Independently review each effective date and device. Verify mobile usability and field-check links, ramps and parking.
3. Build directed routing using surveyed topology and separate ride/walk edges. Evaluate at ETA, keep comfort separate, return “no verified route” when evidence is insufficient, and avoid generic scooter compliance claims.

Milestone tests cover weekday start/end and weekends; all device profiles; missing speed/access; unresolved conflict; dismount walking; total closure; grade-separated crossings; DST gap/fold; and changed access at simulated segment arrival. ETA tests exercise rule evaluation only. Routing remains deferred.
