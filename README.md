# Ride Atlas · UCI + Irvine

A mobile-first React, TypeScript and MapLibre GL JS foundation for checking micromobility access. Read the [milestone design and source review](docs/milestone-1.md) for the architecture, evidence, schema and acceptance plan.

## Run locally

Use Node.js 24 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

The production build is in `dist/`. The contextual basemap requires an internet connection. The fictional practice map and its data are served by the project.

## Milestone status

- **Verified:** The cited agencies publish the claims summarized in the source inventory. OpenFreeMap provides the contextual basemap with attribution. Basemap features carry no access decision.
- **Demonstration:** Switch to **Practice map** to inspect fictional facilities, zones, closures, destinations and parking. Select a device, ride or walk mode, and a Pacific departure time. No synthetic feature represents a real street, trail, sign or restriction.
- **Human review:** Resolve campus schedule and device scope, identify the controlling city and county rules, obtain reusable geometry and verify boundaries, signs, closures and parking. The Irvine view lists review issues. Unreviewed geometry is kept out of the real access overlay.
- **Routing:** Deferred. Topology and arrival-time checks are unit tests for future routing work.
- **Corrections and privacy:** Reports export as local JSON with a dataset, feature ID and user-written note. The app requests no location and stores no location history. The real basemap makes requests to its third-party provider.

Versioned GeoJSON and rule bundles are loaded through a repository contract. A PostGIS adapter can implement this contract via a server without putting credentials in client code.
