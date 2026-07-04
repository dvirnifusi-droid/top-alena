// Approve/reject flow for email-imported invoices (called from the
// InvoiceReviewModal via base44.functions.*). Approve = one transaction:
// invoice fields + line items + inventory apply + learning (aliases, sender
// rule, supplier activation).
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { normalizeForMatch } from '../lib/invoiceExtraction.js';
import { nextRuleAfterRejection } from '../lib/emailInvoiceRules.js';

type ApproveItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit?: string | null;
  inventory_action: 'add_existing' | 'create_new' | 'skip';
  inventory_item_id?: string | null;
};

registerFn('emailInvoiceApprove', async ({ body }) => {
  const p = (body as any) || {};
  const inv: any = await (prisma as any).invoice.findUnique({ where: { id: String(p.invoice_id || '') } });
  if (!inv) throw new Error('invoice_not_found');
  if (inv.status !== 'pending_review') throw new Error('invoice_not_pending');
  if (inv.inventory_applied) throw new Error('inventory_already_applied');

  const items: ApproveItem[] = Array.isArray(p.items) ? p.items : [];
  const finalSupplierId = p.supplier_id ? String(p.supplier_id) : inv.supplier_id;

  await (prisma as any).$transaction(async (tx: any) => {
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        invoice_number: p.invoice_number != null ? String(p.invoice_number).slice(0, 60) : inv.invoice_number,
        invoice_date: p.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(p.invoice_date)
          ? new Date(`${p.invoice_date}T00:00:00.000Z`) : inv.invoice_date,
        total_amount: p.total_amount != null ? Number(p.total_amount) : inv.total_amount,
        supplier_id: finalSupplierId,
        payment_status: p.payment_status === 'paid' ? 'paid' : 'unpaid',
        status: 'processed',
        inventory_applied: true,
      },
    });

    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      await tx.invoiceItem.update({
        where: { id: it.id },
        data: {
          product_name: String(it.product_name).slice(0, 200),
          quantity: qty,
          unit_price: price,
          unit: it.unit ? String(it.unit).slice(0, 30) : null,
          inventory_action: it.inventory_action,
          inventory_item_id: it.inventory_item_id || null,
        },
      });

      if (it.inventory_action === 'add_existing' && it.inventory_item_id) {
        await tx.inventory.update({
          where: { id: it.inventory_item_id },
          data: {
            current_stock: { increment: qty },
            ...(price > 0 ? { cost_per_unit: price } : {}),
            last_updated: new Date(),
          },
        });
        // Learning: remember this invoice-name → inventory-item mapping.
        await tx.productAlias.upsert({
          where: { alias_name: normalizeForMatch(it.product_name) },
          update: { inventory_item_id: it.inventory_item_id },
          create: {
            alias_name: normalizeForMatch(it.product_name),
            inventory_item_id: it.inventory_item_id,
            supplier_id: finalSupplierId,
          },
        });
      } else if (it.inventory_action === 'create_new') {
        const created = await tx.inventory.create({
          data: {
            item_name: String(it.product_name).slice(0, 200),
            category: String(p.category || 'אחר').slice(0, 60),
            current_stock: qty,
            unit: it.unit ? String(it.unit).slice(0, 30) : 'יח\'',
            cost_per_unit: price,
            supplier_id: finalSupplierId,
            last_updated: new Date(),
          },
        });
        await tx.productAlias.upsert({
          where: { alias_name: normalizeForMatch(it.product_name) },
          update: { inventory_item_id: created.id },
          create: {
            alias_name: normalizeForMatch(it.product_name),
            inventory_item_id: created.id,
            supplier_id: finalSupplierId,
          },
        });
      }
      // 'skip' → nothing.
    }

    // Learning: sender becomes trusted; auto-created supplier becomes active.
    if (inv.email_sender) {
      await tx.emailSenderRule.upsert({
        where: { sender_email: inv.email_sender },
        update: { rule: 'allow', reject_count: 0, supplier_id: finalSupplierId },
        create: { sender_email: inv.email_sender, rule: 'allow', supplier_id: finalSupplierId },
      });
    }
    await tx.supplier.updateMany({
      where: { id: finalSupplierId, status: 'pending_approval' },
      data: { status: 'active' },
    });
  });

  return { ok: true };
});

registerFn('emailInvoiceReject', async ({ body }) => {
  const p = (body as any) || {};
  const inv: any = await (prisma as any).invoice.findUnique({ where: { id: String(p.invoice_id || '') } });
  if (!inv) throw new Error('invoice_not_found');
  if (inv.status !== 'pending_review') throw new Error('invoice_not_pending');

  await (prisma as any).invoice.update({ where: { id: inv.id }, data: { status: 'rejected' } });

  // Learning: strike the sender; two strikes → block.
  let senderBlocked = false;
  if (inv.email_sender) {
    const existing: any = await (prisma as any).emailSenderRule.findUnique({
      where: { sender_email: inv.email_sender },
    }).catch(() => null);
    const next = nextRuleAfterRejection(existing || { rule: 'auto', reject_count: 0 });
    await (prisma as any).emailSenderRule.upsert({
      where: { sender_email: inv.email_sender },
      update: { rule: next.rule, reject_count: next.reject_count },
      create: { sender_email: inv.email_sender, rule: next.rule, reject_count: next.reject_count },
    });
    senderBlocked = next.rule === 'block';
  }

  // Clean up an auto-created supplier that has no other invoices.
  const others = await (prisma as any).invoice.count({
    where: { supplier_id: inv.supplier_id, id: { not: inv.id } },
  }).catch(() => 1);
  if (others === 0) {
    await (prisma as any).supplier.deleteMany({
      where: { id: inv.supplier_id, status: 'pending_approval' },
    }).catch(() => {});
  }

  return { ok: true, sender_blocked: senderBlocked };
});
