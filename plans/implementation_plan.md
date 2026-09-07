# Mapbox Style Update Plan

This change will update the Mapbox map style in your frontend application to show local area names, neighborhoods, and street details when zoomed in.

## Proposed Changes

### Frontend Configuration

#### [MODIFY] [.env](file:///c:/Users/admin/Desktop/appzeto/zoogno/frontend/.env)
- Update `VITE_MAPBOX_STYLE` from `mapbox://styles/mapbox/light-v11` to `mapbox://styles/mapbox/streets-v12`.
- This change will switch the default minimalist map style to the Streets style, which includes rich details like locality names, points of interest, and street names.

## Verification Plan
1. Edit the `.env` file with the new value.
2. If necessary, you may need to restart your Vite development server (`npm run dev`) manually for the new `.env` variables to take effect.
3. Open the map view in the browser, zoom in, and verify that local area names are now visible.
