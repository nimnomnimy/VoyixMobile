# VoyixMobile — Kmart mPOS

Mobile Point of Sale for Kmart, powered by NCR Voyix BSP APIs.

## Architecture

```
voyix-mobile/
├── bff/        Node.js Fastify backend-for-frontend (HMAC signs NCR API requests)
└── mobile/     Expo React Native cashier POS app
```

## Quick Start

```bash
# Install all workspace dependencies
yarn install

# Start BFF (terminal 1)
cp .env.local bff/.env
yarn bff

# Start mobile (terminal 2)
cp .env.local mobile/.env
yarn mobile
```

## BSP API Gateway

`https://api.ncr.com` — all requests HMAC-signed (AccessKey scheme)

### Services used
| Service   | Base path                                   |
|-----------|---------------------------------------------|
| Catalog   | `/catalog/v2`                               |
| Orders    | `/order/3/orders/1`                         |
| TDM       | `/transaction-document/transaction-documents` |
| CDM       | `/cdm`                                      |
| Sites     | `/site`                                     |
| Images    | `/image/v1/images`                          |
