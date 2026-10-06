# TURN relay (coturn) for WebRTC calls between networks that can't connect directly.
#
# - Clients reach it over TCP through Railway's public TCP proxy (Railway has no public UDP).
# - Auth uses coturn's "TURN REST API" scheme: the backend issues short-lived credentials
#   (username = expiry timestamp, password = HMAC-SHA1 of it with TURN_SECRET), so no
#   long-lived password is ever sent to browsers.
# - Both callers are relayed by this same server, so media goes relay-to-relay inside it.
FROM coturn/coturn:4.6

ENTRYPOINT ["sh", "-c", "exec turnserver -n --log-file=stdout --simple-log \
  --listening-port=3478 --realm=zoom-clone \
  --use-auth-secret --static-auth-secret=\"$TURN_SECRET\" \
  --fingerprint --no-tls --no-dtls --no-cli --no-multicast-peers \
  --denied-peer-ip=169.254.0.0-169.254.255.255 \
  --min-port=49152 --max-port=49452 --user-quota=12 --total-quota=300 --max-bps=3000000"]
