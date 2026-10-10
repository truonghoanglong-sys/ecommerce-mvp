const express = require('express');
const { requireUser } = require('./auth-context');
const { ValidationError } = require('../../domain/errors');

function createOrderRoutes(service) {
  const router = express.Router();
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
  router.use(requireUser);

  router.post('/', wrap(async (req, res) => {
    res.status(201).json(await service.placeOrder(req.user, req.body));
  }));

  router.get('/', wrap(async (req, res) => {
    res.json({ items: await service.listOrders(req.user) });
  }));

  router.get('/:oid', wrap(async (req, res) => {
    const oid = Number(req.params.oid);
    if (!Number.isInteger(oid) || oid <= 0) throw ValidationError('oid must be a positive integer');
    res.json(await service.getOrder(req.user, oid));
  }));

  return router;
}

module.exports = { createOrderRoutes };
