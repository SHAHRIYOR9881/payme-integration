// Transaksiyalar
const mongoose = require("mongoose");
const Transaction = new mongoose.Schema({
    driver: { type: String, required: true },
    tid: { type: String },
    transaction: { type: String, required: true, unique: true },
    time: { type: Number },
    state: { type: Number },
    create_time: { type: Number },
    perform_time: { type: Number },
    cancel_time: { type: Number },
    amount: { type: Number },
    reason: { type: Number },
});

module.exports = mongoose.model("payme-transaction", Transaction);