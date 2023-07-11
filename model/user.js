// Foydalanuvchilar
const mongoose = require("mongoose");
const UserSchema = mongoose.Schema(
    {
        name: { type: String, required: true },
        phone: { type: String, required: true, unique: true }, // 998901299881
        balance: { type: Number, default: 0 }, // foydalanuvchining hisob raqamidagi puli
        uid: { type: Number, required: true, unique: true },
    },
    { timestamps: true }
);

const Users = mongoose.model("user", UserSchema);
module.exports = Users;