FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \\
    DISPLAY=:99 \\
    HOME=/home/browser \\
    PORT=10000 \\
    BROWSER_DATA_DIR=/tmp/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \\
    ca-certificates chromium xvfb x11vnc novnc websockify \\
    fonts-liberation fonts-noto-color-emoji dbus-x11 nodejs npm tini \\
    && rm -rf /var/lib/apt/lists/* \\
    && useradd -m -s /bin/bash browser \\
    && mkdir -p /app/public /tmp/chromium \\
    && chown -R browser:browser /home/browser /tmp/chromium

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY public ./public
COPY start.sh ./
RUN chmod +x /app/start.sh

EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]
