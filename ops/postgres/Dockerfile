# The exact base currently used by permit-map-postgres. Do not replace the
# running container as part of installing/enabling the extension.
FROM postgres@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5

ARG POSTGIS_VERSION=3.7.0+dfsg-1.pgdg12+1
RUN apt-get update \
    && apt-get install -y --no-install-recommends --no-upgrade \
       postgresql-17-postgis-3=${POSTGIS_VERSION} \
       postgresql-17-postgis-3-scripts=${POSTGIS_VERSION} \
    && rm -rf /var/lib/apt/lists/*
