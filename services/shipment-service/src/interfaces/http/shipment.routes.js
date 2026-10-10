const express = require('express');
const service = require('../../application/shipment.service');
const { ValidationError } = require('../../domain/errors');
const { requireUser, requireRole } = require('./auth-context');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const intParam = (v, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw ValidationError(`${name} must be a positive integer`);
  return n;
};

router.use(requireUser);

// UC12 – khách xem trạng thái giao hàng theo mã đơn (tiện hơn vì khách biết oid, không biết shipid)
router.get('/order/:oid', wrap(async (req, res) => {
  res.json(await service.getByOid(req.user, intParam(req.params.oid, 'oid')));
}));

router.get('/:shipid', wrap(async (req, res) => {
  res.json(await service.getByShipid(req.user, intParam(req.params.shipid, 'shipid')));
}));

// UC11 – cập nhật trạng thái (Gateway đã chặn role; service kiểm tra lại)
router.patch('/:shipid/status', requireRole('SHIPMENT_STAFF', 'ADMIN'), wrap(async (req, res) => {
  const status = req.body && req.body.status;
  if (typeof status !== 'string') throw ValidationError('status is required');
  res.json(await service.updateStatus(req.user, intParam(req.params.shipid, 'shipid'), status));
}));

module.exports = router;
