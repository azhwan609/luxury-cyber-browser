# LUXURY CYBER BROWSER

A private remote Chromium workspace designed to be embedded in an existing web application.

## Architecture
- Chromium runs in an isolated Debian container with Xvfb.
- noVNC streams the remote desktop to a responsive, mobile-first web interface.
- An authenticated Express gateway protects HTTP routes and the WebSocket bridge.
- Browser toolbar actions use Chromium's local DevTools Protocol endpoint; it is not publicly exposed.
- Chromium profile data is stored under `/data/chromium`; Render's persistent disk is mounted at `/data`.
- Only the Render HTTP service port is public.

## Render deployment
The included `render.yaml` defines one independent Docker web service in Frankfurt, a 1 CPU / 2 GB RAM compute plan, and a 2 GB persistent disk. Review the Render Blueprint plan and pricing before applying it.

## Access
Render generates `ACCESS_CODE` and `SESSION_SECRET`. After deployment, open the service URL and retrieve `ACCESS_CODE` from the service's Environment page. Never publish or commit either secret.

## Limitations
- This is a remote desktop browser, not an iframe proxy; websites render inside Chromium.
- Some Chrome Web Store extensions, DRM-protected media, hardware acceleration, and websites that block datacenter IPs may not work.
- Browser profile data persists on the attached disk; website login sessions may still expire when individual sites require re-authentication.
- Do not expose VNC/noVNC or the Chromium DevTools endpoint directly, and do not remove the authentication gateway.
