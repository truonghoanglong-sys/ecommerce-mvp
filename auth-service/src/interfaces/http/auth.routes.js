const express = require('express');
const authService = require('../../application/auth.service');

const router = express.Router();

// Controller mỏng: nhận request → gọi use case → trả response. Không chứa nghiệp vụ.
router.post('/register', async (req, res, next) => {
  try {
    res.status(201).json(await authService.register(req.body || {}));
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    res.status(200).json(await authService.login(req.body || {}));
  } catch (err) { next(err); }
});

module.exports = router;
