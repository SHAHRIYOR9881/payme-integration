// Foydalanuvchilar to'lagan to'lovlar jurnali
const mongoose = require("mongoose");
const JournalSchema = new mongoose.Schema({
    driver: { type: mongoose.Schema.ObjectId, ref: "user", required: true },
    amount: { type: Number, required: true },
    system: { type: String, required: true },
}, {
    timestamps: true,
});

module.exports = mongoose.model("payme-journal", JournalSchema);