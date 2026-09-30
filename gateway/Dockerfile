FROM nginx:1.27-alpine

RUN apk add --no-cache curl openssl

# Generate default SSL certificate for 3.110.66.16 & api.gitrabbit.co so Port 443 starts out-of-the-box
RUN mkdir -p /etc/ssl/gitrabbit /var/www/certbot /var/log/nginx && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout /etc/ssl/gitrabbit/privkey.pem \
      -out /etc/ssl/gitrabbit/fullchain.pem \
      -subj "/CN=api.gitrabbit.co" \
      -addext "subjectAltName=DNS:api.gitrabbit.co,IP:3.110.66.16,DNS:localhost"

COPY cloudflare.conf /etc/nginx/cloudflare.conf
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
