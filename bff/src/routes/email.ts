/**
 * Email routes — sends order receipts with embedded QR code.
 *
 * Requires SMTP config in env vars (optional — endpoint returns 503 if unconfigured):
 *   EMAIL_SMTP_HOST     e.g. smtp.gmail.com
 *   EMAIL_SMTP_PORT     e.g. 587
 *   EMAIL_SMTP_USER     e.g. store@kmart.com.au
 *   EMAIL_SMTP_PASS     App password or SMTP password
 *   EMAIL_FROM_NAME     e.g. "Kmart Store" (optional, defaults to EMAIL_SMTP_USER)
 */
import type { FastifyInstance } from 'fastify';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';

function buildTransport() {
  const host = process.env.EMAIL_SMTP_HOST;
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.EMAIL_SMTP_PORT ?? '587'),
    secure: process.env.EMAIL_SMTP_PORT === '465',
    auth: { user, pass },
  });
}

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;        // unit price
  effectivePrice?: number;
}

interface ReceiptBody {
  to: string;
  orderId: string;
  timestamp: string;
  items: ReceiptItem[];
  total: number;
  surcharge?: number;
  paymentMethod?: string;
  refundedTotal?: number;
  storeName?: string;
}

function buildReceiptHtml(body: ReceiptBody, qrDataUrl: string): string {
  const storeName = body.storeName ?? 'Kmart';
  const itemRows = body.items.map((item) => {
    const lineTotal = item.price * item.quantity;
    const discounted = item.effectivePrice !== undefined && item.effectivePrice !== item.price;
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.name}</td>
        <td style="padding:8px 8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;${discounted ? 'text-decoration:line-through;color:#999;' : ''}">$${lineTotal.toFixed(2)}</td>
        ${discounted ? `<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#2a9d2a;">$${((item.effectivePrice ?? item.price) * item.quantity).toFixed(2)}</td>` : '<td></td>'}
      </tr>`;
  }).join('');

  const subtotal = body.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const savings = parseFloat((subtotal - (body.total - (body.surcharge ?? 0))).toFixed(2));

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#CC0000;padding:28px 32px;text-align:center;">
            <div style="font-size:26px;font-weight:bold;color:#fff;letter-spacing:1px;">${storeName}</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Tax Invoice / Receipt</div>
          </td>
        </tr>

        <!-- Order info -->
        <tr>
          <td style="padding:24px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#888;">Order ID</td>
                <td style="font-size:12px;color:#888;text-align:right;">Date &amp; Time</td>
              </tr>
              <tr>
                <td style="font-size:14px;font-weight:bold;color:#222;font-family:monospace;">${body.orderId}</td>
                <td style="font-size:14px;color:#222;text-align:right;">${body.timestamp}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Items -->
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <thead>
                <tr>
                  <th style="font-size:11px;text-transform:uppercase;color:#888;text-align:left;padding-bottom:8px;border-bottom:2px solid #CC0000;">Item</th>
                  <th style="font-size:11px;text-transform:uppercase;color:#888;text-align:center;padding-bottom:8px;border-bottom:2px solid #CC0000;">Qty</th>
                  <th style="font-size:11px;text-transform:uppercase;color:#888;text-align:right;padding-bottom:8px;border-bottom:2px solid #CC0000;">Price</th>
                  <th style="font-size:11px;text-transform:uppercase;color:#888;text-align:right;padding-bottom:8px;border-bottom:2px solid #CC0000;"></th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
          </td>
        </tr>

        <!-- Totals -->
        <tr>
          <td style="padding:16px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${savings > 0.009 ? `
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#2a9d2a;">Savings</td>
                <td style="padding:4px 0;font-size:13px;color:#2a9d2a;text-align:right;">-$${savings.toFixed(2)}</td>
              </tr>` : ''}
              ${body.surcharge ? `
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#e08000;">${body.paymentMethod ?? 'Card'} surcharge (1.5%)</td>
                <td style="padding:4px 0;font-size:13px;color:#e08000;text-align:right;">$${body.surcharge.toFixed(2)}</td>
              </tr>` : ''}
              <tr style="border-top:2px solid #eee;">
                <td style="padding:12px 0 4px;font-size:16px;font-weight:bold;color:#222;">Total (inc. GST)</td>
                <td style="padding:12px 0 4px;font-size:16px;font-weight:bold;color:#CC0000;text-align:right;">$${body.total.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="font-size:11px;color:#aaa;">GST included (1/11th)</td>
                <td style="font-size:11px;color:#aaa;text-align:right;">$${(body.total / 11).toFixed(2)}</td>
              </tr>
              ${body.paymentMethod ? `
              <tr>
                <td style="padding-top:8px;font-size:12px;color:#888;">Paid by</td>
                <td style="padding-top:8px;font-size:12px;color:#888;text-align:right;">${body.paymentMethod}</td>
              </tr>` : ''}
            </table>
          </td>
        </tr>

        <!-- QR code -->
        <tr>
          <td style="padding:0 32px 24px;text-align:center;">
            <div style="border-top:1px solid #eee;padding-top:20px;">
              <div style="font-size:12px;color:#888;margin-bottom:12px;">Scan for returns &amp; order lookup</div>
              <img src="${qrDataUrl}" width="160" height="160" alt="Order QR" style="display:block;margin:0 auto;" />
              <div style="font-size:10px;color:#bbb;margin-top:8px;font-family:monospace;">${body.orderId}</div>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
            <div style="font-size:11px;color:#aaa;">Thank you for shopping at ${storeName}</div>
            <div style="font-size:10px;color:#ccc;margin-top:4px;">Keep this email as your proof of purchase</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function emailRoutes(app: FastifyInstance) {
  /**
   * Send a receipt email with embedded QR code.
   * Returns 503 if SMTP is not configured in env vars.
   */
  app.post<{ Body: ReceiptBody }>(
    '/receipt',
    {
      schema: {
        body: {
          type: 'object',
          required: ['to', 'orderId', 'timestamp', 'items', 'total'],
          properties: {
            to:            { type: 'string' },
            orderId:       { type: 'string' },
            timestamp:     { type: 'string' },
            items:         { type: 'array' },
            total:         { type: 'number' },
            surcharge:     { type: 'number' },
            paymentMethod: { type: 'string' },
            refundedTotal: { type: 'number' },
            storeName:     { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const transport = buildTransport();
      if (!transport) {
        return reply.status(503).send({ error: 'Email not configured on this server' });
      }

      const qrDataUrl = await QRCode.toDataURL(req.body.orderId, {
        width: 320,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });

      const html = buildReceiptHtml(req.body, qrDataUrl);
      const fromName = process.env.EMAIL_FROM_NAME ?? process.env.EMAIL_SMTP_USER ?? 'Kmart';
      const fromAddr = process.env.EMAIL_SMTP_USER ?? '';

      await transport.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: req.body.to,
        subject: `Your ${req.body.storeName ?? 'Kmart'} receipt — Order ${req.body.orderId.slice(-8)}`,
        html,
      });

      return { ok: true };
    },
  );

  /**
   * Generate a QR code PNG as base64 data URL for a given value.
   * Used by the mobile app when the JS qrcode library fails in the RN environment.
   */
  app.get<{ Querystring: { value: string } }>(
    '/qr',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['value'],
          properties: { value: { type: 'string' } },
        },
      },
    },
    async (req) => {
      const dataUrl = await QRCode.toDataURL(req.query.value, {
        width: 320,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });
      return { dataUrl };
    },
  );

  /** Check whether email is configured (no auth required — used by Settings screen). */
  app.get('/status', async () => {
    const configured = !!(
      process.env.EMAIL_SMTP_HOST &&
      process.env.EMAIL_SMTP_USER &&
      process.env.EMAIL_SMTP_PASS
    );
    return { configured, fromName: process.env.EMAIL_FROM_NAME ?? process.env.EMAIL_SMTP_USER ?? null };
  });
}
