const express = require('express');
const service = require('../../application/product.service');
const { ValidationError } = require('../../domain/errors');
const { requireUser, requireRole } = require('./auth-context');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function parsePid(req) {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid) || pid <= 0) throw ValidationError('pid must be a positive integer');
  return pid;
}

router.use(requireUser); // API spec: mọi API product đều cần JWT

// UC04 – ai đăng nhập cũng xem được
router.get('/', wrap(async (req, res) => res.json({ items: await service.list() })));
router.get('/:pid', wrap(async (req, res) => res.json(await service.getOne(parsePid(req)))));

// UC05 – chỉ ADMIN
router.post('/', requireRole('ADMIN'), wrap(async (req, res) => {
  res.status(201).json(await service.create(req.body || {}));
}));
router.put('/:pid', requireRole('ADMIN'), wrap(async (req, res) => {
  const p = await service.update(parsePid(req), req.body || {});
  res.json({ message: 'Product updated successfully', ...p });
}));
router.delete('/:pid', requireRole('ADMIN'), wrap(async (req, res) => {
  const pid = parsePid(req);
  await service.remove(pid);
  res.json({ message: 'Product deleted successfully', pid });
}));

module.exports = router;
