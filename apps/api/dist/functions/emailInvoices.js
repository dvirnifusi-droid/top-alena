// Approve/reject flow for email-imported invoices (called from the
// InvoiceReviewModal via base44.functions.*). Approve = one transaction:
// invoice fields + line items + inventory apply + learning (aliases, sender
// rule, supplier activation).
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { normalizeForMatch } from '../lib/invoiceExtraction.js';
import { nextRuleAfterRejection } from '../lib/emailInvoiceRules.js';
registerFn('emailInvoiceApprove', async ({ body }) => {
    const p = body || {};
    const inv = await prisma.invoice.findUnique({ where: { id: String(p.invoice_id || '') } });
    if (!inv)
        throw new Error('invoice_not_found');
    if (inv.status !== 'pending_review')
        throw new Error('invoice_not_pending');
    if (inv.inventory_applied)
        throw new Error('inventory_already_applied');
    const items = Array.isArray(p.items) ? p.items : [];
    const finalSupplierId = p.supplier_id ? String(p.supplier_id) : inv.supplier_id;
    await prisma.$transaction(async (tx) => {
        // Atomic guard: only one concurrent approve can win this updateMany
        // (status/inventory_applied re-checked inside the transaction).
        const { count } = await tx.invoice.updateMany({
            where: { id: inv.id, status: 'pending_review', inventory_applied: false },
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
        if (count === 0)
            throw new Error('invoice_already_processed');
        for (const it of items) {
            const qty = Number(it.quantity) || 0;
            const price = Number(it.unit_price) || 0;
            // Ownership check: only touch items that belong to this invoice.
            const itemRes = await tx.invoiceItem.updateMany({
                where: { id: it.id, invoice_id: inv.id },
                data: {
                    product_name: String(it.product_name).slice(0, 200),
                    quantity: qty,
                    unit_price: price,
                    unit: it.unit ? String(it.unit).slice(0, 30) : null,
                    inventory_action: it.inventory_action,
                    inventory_item_id: it.inventory_item_id || null,
                },
            });
            if (itemRes.count === 0)
                throw new Error(`item_not_found: ${it.id}`);
            const upsertAlias = (inventoryItemId) => tx.productAlias.upsert({
                where: { alias_name: normalizeForMatch(it.product_name) },
                update: { inventory_item_id: inventoryItemId },
                create: {
                    alias_name: normalizeForMatch(it.product_name),
                    inventory_item_id: inventoryItemId,
                    supplier_id: finalSupplierId,
                },
            });
            if (it.inventory_action === 'add_existing' && it.inventory_item_id) {
                const invItem = await tx.inventory.findUnique({ where: { id: it.inventory_item_id } });
                if (!invItem)
                    throw new Error(`inventory_item_deleted: ${it.inventory_item_id}`);
                await tx.inventory.update({
                    where: { id: it.inventory_item_id },
                    data: {
                        current_stock: { increment: qty },
                        ...(price > 0 ? { cost_per_unit: price } : {}),
                        last_updated: new Date(),
                    },
                });
                // Learning: remember this invoice-name → inventory-item mapping.
                await upsertAlias(it.inventory_item_id);
            }
            else if (it.inventory_action === 'create_new') {
                const created = await tx.inventory.create({
                    data: {
                        item_name: String(it.product_name).slice(0, 200),
                        // Single invoice-level category applies to all new items from this approve (UX: one pick per review).
                        category: String(p.category || 'אחר').slice(0, 60),
                        current_stock: qty,
                        unit: it.unit ? String(it.unit).slice(0, 30) : 'יח\'',
                        cost_per_unit: price,
                        supplier_id: finalSupplierId,
                        last_updated: new Date(),
                    },
                });
                await upsertAlias(created.id);
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
    }, { timeout: 15_000, maxWait: 5_000 });
    return { ok: true };
});
registerFn('emailInvoiceReject', async ({ body }) => {
    const p = body || {};
    const inv = await prisma.invoice.findUnique({ where: { id: String(p.invoice_id || '') } });
    if (!inv)
        throw new Error('invoice_not_found');
    if (inv.status !== 'pending_review')
        throw new Error('invoice_not_pending');
    // Atomic guard: only reject if still pending (loses cleanly to a concurrent approve/reject).
    const { count } = await prisma.invoice.updateMany({
        where: { id: inv.id, status: 'pending_review' },
        data: { status: 'rejected' },
    });
    if (count === 0)
        throw new Error('invoice_already_processed');
    // Learning: strike the sender; two strikes → block.
    let senderBlocked = false;
    if (inv.email_sender) {
        const existing = await prisma.emailSenderRule.findUnique({
            where: { sender_email: inv.email_sender },
        }).catch(() => null);
        const next = nextRuleAfterRejection(existing || { rule: 'auto', reject_count: 0 });
        await prisma.emailSenderRule.upsert({
            where: { sender_email: inv.email_sender },
            update: { rule: next.rule, reject_count: next.reject_count },
            create: { sender_email: inv.email_sender, rule: next.rule, reject_count: next.reject_count },
        });
        senderBlocked = next.rule === 'block';
    }
    // Clean up an auto-created supplier that has no other invoices.
    const others = await prisma.invoice.count({
        where: { supplier_id: inv.supplier_id, id: { not: inv.id } },
    }).catch(() => 1);
    if (others === 0) {
        await prisma.supplier.deleteMany({
            where: { id: inv.supplier_id, status: 'pending_approval' },
        }).catch(() => { });
    }
    return { ok: true, sender_blocked: senderBlocked };
});
//# sourceMappingURL=emailInvoices.js.map