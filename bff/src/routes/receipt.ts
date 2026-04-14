/**
 * Receipt hosting — saves order receipt data and serves a public HTML page.
 *
 * POST /api/receipt        — save receipt, returns { url }
 * GET  /receipt/:id        — public HTML receipt page (no auth required)
 */
import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  effectivePrice?: number;
}

interface ReceiptData {
  orderId: string;
  timestamp: string;
  items: ReceiptItem[];
  total: number;
  surcharge?: number;
  paymentMethod?: string;
  storeName?: string;
  savedAt: number;
}

// In-memory store — receipts are available for the life of the server process.
// Render free tier restarts occasionally; receipts are best-effort (email is the durable copy).
const receipts = new Map<string, ReceiptData>();

// Clean up receipts older than 7 days every hour
setInterval(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, r] of receipts) {
    if (r.savedAt < cutoff) receipts.delete(id);
  }
}, 60 * 60 * 1000);

function buildReceiptHtml(r: ReceiptData, receiptUrl: string, qrDataUrl: string): string {
  const storeName = r.storeName ?? 'Kmart';
  const itemRows = r.items.map((item) => {
    const lineTotal = item.price * item.quantity;
    const discounted = item.effectivePrice !== undefined && item.effectivePrice !== item.price;
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.name}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;${discounted ? 'text-decoration:line-through;color:#999;' : ''}">$${lineTotal.toFixed(2)}</td>
        ${discounted ? `<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#2a9d2a;">$${((item.effectivePrice ?? item.price) * item.quantity).toFixed(2)}</td>` : '<td></td>'}
      </tr>`;
  }).join('');

  const subtotal = r.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const savings = parseFloat((subtotal - (r.total - (r.surcharge ?? 0))).toFixed(2));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${storeName} Receipt — Order ${r.orderId.slice(-8)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">

        <tr>
          <td style="background:#CC0000;padding:28px 32px;text-align:center;">
            <div style="font-size:26px;font-weight:bold;color:#fff;letter-spacing:1px;">${storeName}</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Tax Invoice / Receipt</div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#888;">Order ID</td>
                <td style="font-size:12px;color:#888;text-align:right;">Date &amp; Time</td>
              </tr>
              <tr>
                <td style="font-size:14px;font-weight:bold;color:#222;font-family:monospace;">${r.orderId}</td>
                <td style="font-size:14px;color:#222;text-align:right;">${r.timestamp}</td>
              </tr>
            </table>
          </td>
        </tr>

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

        <tr>
          <td style="padding:16px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${savings > 0.009 ? `
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#2a9d2a;">Savings</td>
                <td style="padding:4px 0;font-size:13px;color:#2a9d2a;text-align:right;">-$${savings.toFixed(2)}</td>
              </tr>` : ''}
              ${r.surcharge ? `
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#e08000;">Surcharge (1.5%)</td>
                <td style="padding:4px 0;font-size:13px;color:#e08000;text-align:right;">$${r.surcharge.toFixed(2)}</td>
              </tr>` : ''}
              <tr style="border-top:2px solid #eee;">
                <td style="padding:12px 0 4px;font-size:16px;font-weight:bold;color:#222;">Total (inc. GST)</td>
                <td style="padding:12px 0 4px;font-size:16px;font-weight:bold;color:#CC0000;text-align:right;">$${r.total.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="font-size:11px;color:#aaa;">GST included</td>
                <td style="font-size:11px;color:#aaa;text-align:right;">$${(r.total / 11).toFixed(2)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 24px;text-align:center;">
            <div style="border-top:1px solid #eee;padding-top:20px;">
              <div style="font-size:12px;color:#888;margin-bottom:12px;">Scan for returns &amp; order lookup</div>
              <img src="${qrDataUrl}" width="160" height="160" alt="Order QR" style="display:block;margin:0 auto;" />
              <div style="font-size:10px;color:#bbb;margin-top:8px;font-family:monospace;">${r.orderId}</div>
            </div>
          </td>
        </tr>

        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
            <div style="font-size:11px;color:#aaa;">Thank you for shopping at ${storeName}</div>
            <div style="font-size:10px;color:#ccc;margin-top:4px;">Keep this page as your proof of purchase</div>
            <div style="font-size:10px;color:#ddd;margin-top:4px;font-family:monospace;">${receiptUrl}</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function receiptRoutes(app: FastifyInstance) {
  /**
   * Save receipt data and return a public URL.
   * Called by the mobile app when an order completes.
   */
  app.post<{
    Body: Omit<ReceiptData, 'savedAt'>;
  }>(
    '/api/receipt',
    {
      schema: {
        body: {
          type: 'object',
          required: ['orderId', 'timestamp', 'items', 'total'],
          properties: {
            orderId:       { type: 'string' },
            timestamp:     { type: 'string' },
            items:         { type: 'array' },
            total:         { type: 'number' },
            surcharge:     { type: 'number' },
            paymentMethod: { type: 'string' },
            storeName:     { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const data: ReceiptData = { ...req.body, savedAt: Date.now() };
      receipts.set(req.body.orderId, data);
      const baseUrl = process.env.PUBLIC_URL ?? 'https://voyixmobile.onrender.com';
      return { url: `${baseUrl}/receipt/${encodeURIComponent(req.body.orderId)}` };
    },
  );

  /**
   * Public receipt page — no auth required, customer-facing.
   */
  app.get<{ Params: { id: string } }>(
    '/receipt/:id',
    async (req, reply) => {
      const receipt = receipts.get(decodeURIComponent(req.params.id));
      if (!receipt) {
        return reply.status(404).type('text/html').send(`
          <!DOCTYPE html><html><body style="font-family:Arial;text-align:center;padding:60px;">
          <h2>Receipt not found</h2>
          <p style="color:#888;">This receipt may have expired or the link is invalid.</p>
          </body></html>
        `);
      }

      const baseUrl = process.env.PUBLIC_URL ?? 'https://voyixmobile.onrender.com';
      const receiptUrl = `${baseUrl}/receipt/${encodeURIComponent(receipt.orderId)}`;

      const qrDataUrl = await QRCode.toDataURL(receiptUrl, {
        width: 320, margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });

      const html = buildReceiptHtml(receipt, receiptUrl, qrDataUrl);
      return reply.type('text/html').send(html);
    },
  );
}
