const router = require('express').Router();
const { payme, checkoutPaycom } = require("../controller/payme")

router.post("/api/payme/pay", payme)
router.get("/api/payme/checkout", checkoutPaycom)

module.exports = router