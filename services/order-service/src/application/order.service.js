const crypto = require('crypto');
const { normalizeItems, checkAvailability, calculatePricing, canView } = require('../domain/order');
const { NotFoundError, ForbiddenError, AppError } = require('../domain/errors');

/**
 * Các phụ thuộc (customers, products, orders) được TRUYỀN VÀO thay vì require trực tiếp
 * → test được nghiệp vụ bằng đối tượng giả, không cần chạy DB hay service khác.
 */
function createOrderService({ customers, products, orders, newId = crypto.randomUUID, logger = console }) {
  // Compensation: hoàn kho. Product đảm bảo hoàn đúng 1 lần nên gọi thừa cũng an toàn.
  async function releaseQuietly(reservationId) {
    try {
      await products.releaseStock(reservationId);
    } catch (err) {
      // Không hoàn được (Product sập) → ghi log nổi bật để xử lý tay / retry sau
      logger.error(`[COMPENSATION FAILED] reservation ${reservationId} not released: ${err.message}`);
    }
  }

  /**
   * UC06 – Đặt hàng. Order Service điều phối toàn bộ (ADR-02):
   *   ① kiểm tra giỏ hàng  ② lấy Customer + % giảm  ③ kiểm tra tồn kho
   *   ④ trừ kho (gRPC)     ⑤ tính tiền               ⑥ lưu Order + Detail + Outbox (1 transaction)
   *   Lỗi ở ⑥ → hoàn kho (compensation)
   */
  async function placeOrder(actor, body) {
    const items = normalizeItems(body && body.items);                       // ①

    const customer = await customers.getCustomer(actor.uid);                // ② (sequence bước 3–4)

    const current = await products.getProducts(items.map((i) => i.pid));    // ③ (bước 6)
    checkAvailability(items, current);

    const reservationId = newId();
    let reserved;
    try {
      reserved = await products.reserveStock(reservationId, items);        // ④ (bước 7)
    } catch (err) {
      // Timeout/mất kết nối: không biết Product đã trừ kho hay chưa → hoàn kho cho chắc
      if (err.status === 503) await releaseQuietly(reservationId);
      throw err;
    }

    const pricing = calculatePricing(reserved.items, customer.discount_percent); // ⑤ (bước 5)

    try {
      const order = await orders.createWithOutbox({ uid: actor.uid, reservationId, pricing }); // ⑥ (bước 8)
      return { ...order, membership: customer.mname };
    } catch (err) {
      logger.error('[placeOrder] saving order failed, releasing stock:', err.message);
      await releaseQuietly(reservationId);
      throw new AppError(500, 'ORDER_NOT_CREATED', 'Order could not be saved; stock has been released');
    }
  }

  // UC10 – Customer xem đơn của mình; ADMIN xem tất cả
  const listOrders = (actor) => orders.findMany(actor.role === 'ADMIN' ? {} : { uid: actor.uid });

  async function getOrder(actor, oid) {
    const order = await orders.findById(oid);
    if (!order) throw NotFoundError(`order ${oid} not found`);
    if (!canView(actor, order)) throw ForbiddenError();
    return order;
  }

  return { placeOrder, listOrders, getOrder };
}

module.exports = { createOrderService };
