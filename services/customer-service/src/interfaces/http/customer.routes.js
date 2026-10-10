const express = require('express');
const service = require('../../application/customer.service');
const { ValidationError } = require('../../domain/errors');
const { requireUser } = require('./auth-context');

const router = express.Router();
router.use(requireUser);

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function parseUid(req) {
  const uid = Number(req.params.uid);
  if (!Number.isInteger(uid) || uid <= 0) throw ValidationError('uid must be a positive integer');
  return uid;
}

// Danh sách hạng thành viên (để client hiển thị chính sách)
router.get('/memberships', wrap(async (req, res) => {
  res.json({ items: await service.listMemberships() });
}));

router.get('/customers/:uid', wrap(async (req, res) => {
  res.json(await service.getCustomer(req.user, parseUid(req)));
}));

router.put('/customers/:uid', wrap(async (req, res) => {
  const customer = await service.updateCustomer(req.user, parseUid(req), req.body || {});
  res.json({ message: 'Customer updated successfully', ...customer });
}));

router.get('/customers/:uid/membership', wrap(async (req, res) => {
  res.json(await service.getMembership(req.user, parseUid(req)));
}));

module.exports = router;
