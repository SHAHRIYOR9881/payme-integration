const Driver = require("../model/user");
const Transaction = require("../model/payme-transaction");
const Journal = require("../model/payme-journal");
const { RPCErrors } = require("../utils/payme-RPCErrors");
const { BillingErrors } = require("../utils/payme-billing-errors");


// Integratsiya qilish
exports.payme = async (req, res) => {
    try {
        const PAYCOM_PASSWORD = "";
        // Response qilish
        function sendResponse(error, result) {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ jsonrpc: "2.0", error: error || undefined, result: result || undefined, id: req.body.id, }));
        }
        // Tokenni tekshiradi
        function checkAuth(auth) {
            return (auth && (auth = auth.trim().split(/ +/)) && auth[0] === "Basic" && auth[1] && (auth = Buffer.from(auth[1], "base64").toString("utf-8")) && (auth = auth.trim().split(/ *: */)) && auth[0] === "Paycom" && auth[1] === PAYCOM_PASSWORD);
        }
        // 1. Metodni tekshiramiz
        if (req.method !== "POST") {
            return sendResponse(RPCErrors.TransportError(), null);
        }
        // 2.Headerdagi tokenni tekshirish
        if (!checkAuth(req.headers["authorization"])) {
            return sendResponse(RPCErrors.AccessDeniet(), null);
        }
        const data = req.body;
        const params = req.body.params;

        switch (data.method) {
            case "CheckPerformTransaction":
                { return CheckPerformTransaction(params.account.user, params.amount) }
                break;
            case "CreateTransaction":
                { return CreateTransaction(params) }
                break;
            case "PerformTransaction":
                { return PerformTransaction(params) }
                break;
            case "CheckTransaction":
                { return CheckTransaction(params) }
                break;
            case "CancelTransaction":
                { return CancelTransaction(params) }
                break;
        }

        async function CheckPerformTransaction(id, amount) {
            // 1. Bazadan mijozni tekshiryapmiz
            await Driver.findOne({ uid: id }, (err, data) => {
                // 2.Bazadan mijozni topilmas
                if (err || !data)
                    return sendResponse(BillingErrors.DriverNotFound(), null);
                // 3.Summani tekshirish
                if (amount / 100 <= 1000)
                    return sendResponse(BillingErrors.IncorrectAmount(), null);
                // return sendResponse(null, { allow: true, });
                return sendResponse(null, {
                    allow: true,
                    detail: {
                        receipt_type: 0,
                        items: [
                            {
                                code: "10899002001000000",
                                title: "Платежи за образовательные",
                                price: amount,
                                count: 1,
                                package_code: id,
                                vat_percent: 0,
                            },
                        ],

                    },
                });
            });
        }
        async function CreateTransaction(param) {
            // 1.Transaksiyani tekshiramiz
            await Transaction.findOne({ tid: param.id }, async (err, data) => {
                // 2 Agar transaksiya topilmasa
                if (!data) {
                    // 2.1 "CheckPerformTransaction" holati boyicha Userni qayta izlayapmiz
                    await Driver.findOne(
                        { uid: param.account.user },
                        async (err, driver) => {
                            if (err || !driver) {
                                return sendResponse(BillingErrors.DriverNotFound(), null);
                            }
                            if (param.amount / 100 <= 1000) // minimal summa - 1000 so'mdan kam bo'lmasligi kerak
                                return sendResponse(BillingErrors.IncorrectAmount(), null);
                        }
                    );
                    // 2.2 Yangi transaksiya yaratilyapti
                    const transaction = new Transaction({
                        tid: param.id, // transaksiya id raqami
                        transaction: Math.floor(Math.random() * 1000000000).toString(),
                        amount: param.amount / 100,
                        state: 1,
                        perform_time: 0,
                        cancel_time: 0,
                        create_time: Date.now(),
                        driver: parseInt(param.account.user),
                        time: param.time,
                    });
                    transaction
                        .save()
                        .then(() => {
                            return sendResponse(null, {
                                transaction: transaction.transaction,
                                state: transaction.state,
                                create_time: transaction.create_time,
                                perform_time: transaction.perform_time,
                                cancel_time: transaction.cancel_time,
                            });
                        })
                        .catch((err) => {
                            console.log(err);
                        });
                }

                // 2 Agar transaksiya topilsa
                if (data) {
                    if (param.id !== data.tid) {
                        return sendResponse(BillingErrors.YesTransaction(), null);
                    }
                    // 2.1State == 1 bolgan holatda
                    if (data.state === 1) {
                        // 2.2 Vaqtni tekshirish
                        if (data.time > param.time) {
                            await Transaction.updateOne(
                                { tid: param.id },
                                { $set: { state: -1, reason: 4, }, },
                                (err, data) => {
                                    return sendResponse(BillingErrors.UnexpectedTransactionState(), null);
                                }
                            );
                        } else {
                            return sendResponse(null, {
                                state: data.state,
                                create_time: data.create_time,
                                transaction: data.transaction,
                                perform_time: data.perform_time || 0,
                                cancel_time: data.cancel_time || 0,
                            });
                        }
                    }
                    // -31008 qaytaradi
                    else {
                        return sendResponse(BillingErrors.UnexpectedTransactionState(), null);
                    }
                }
            });
        }
        async function PerformTransaction(param) {
            // 1.Transaksiyan
            await Transaction.findOne({ tid: param.id }, async (err, transaction) => {
                // 2.Transaksiya topilmasa
                if (!transaction)
                    return sendResponse(BillingErrors.TransactionNotFound(), null);

                // State == 1 bolganda
                if (transaction.state === 1) {
                    // Vaqtni tekshirish
                    if (transaction.time > Date.now()) {
                        // togri keganda transaksiyani qaytarish  { state: -1,  reason: 4 }
                        await Transaction.updateOne(
                            { tid: param.id },
                            { $set: { state: -1, reason: 4, }, }
                        );
                        return sendResponse(BillingErrors.UnexpectedTransactionState(), null);
                    } else {
                        // To'lov qilsa Jurnalga yozib qoyadi;
                        const driver = await Driver.findOne({ uid: transaction.driver });
                        const journal = new Journal({ system: "payme", amount: transaction.amount, driver: driver._id });
                        await journal.save();

                        // Foydalanuvchini Balansini o'zgartirib qo'yish
                        let allbalance = driver.balance + transaction.amount;
                        await Driver.updateOne({ uid: transaction.driver }, { $set: { balance: allbalance } });

                        // State: qilib tahrirlash
                        await Transaction.updateOne({ tid: transaction.tid }, { $set: { state: 2, perform_time: Date.now() } });
                        const tt = await Transaction.findOne({ tid: transaction.tid });
                        return sendResponse(null, {
                            transaction: transaction.transaction,
                            perform_time: tt.perform_time,
                            state: 2,
                        });
                    }
                }

                // State == 2 bolganda
                if (transaction.state === 2) {
                    return sendResponse(null, {
                        transaction: transaction.transaction,
                        perform_time: transaction.perform_time,
                        state: transaction.state,
                    });
                } else {
                    return sendResponse(BillingErrors.UnexpectedTransactionState(), null);
                }
            });
        }
        async function CancelTransaction(param) {
            await Transaction.findOne({ tid: param.id }, async (err, transaction) => {
                if (err || !transaction)
                    return sendResponse(BillingErrors.TransactionNotFound(), null);
                if (transaction.state === 1) {
                    await Transaction.updateOne(
                        { tid: transaction.tid },
                        { $set: { state: -1, reason: param.reason, cancel_time: Date.now() } }
                    );
                    await Transaction.findOne(
                        { tid: transaction.tid },
                        async (err, data) => {
                            if (err) return sendResponse(err, null);
                            const dr = await Driver.find({ uid: transaction.driver });
                            await Journal.findOneAndDelete(
                                { driver: dr.uid },
                                (err, data) => {
                                    if (err) return sendResponse(err, null);
                                }
                            );
                            return sendResponse(null, {
                                state: data.state,
                                cancel_time: data.cancel_time,
                                transaction: data.transaction,
                                create_time: data.create_time,
                                perform_time: data.perform_time || 0,
                            });
                        }
                    );
                } else {
                    if (transaction.state === 2) {
                        await Driver.findOne(
                            { uid: transaction.driver },
                            async (err, driver) => {
                                if (err) return sendResponse(err, null);

                                if (driver.balance >= transaction.amount) {
                                    let newbalance = driver.balance - transaction.amount;
                                    await Driver.updateOne({ uid: transaction.driver }, { $set: { balance: newbalance, } });

                                    await Transaction.updateOne({ tid: transaction.tid }, { $set: { state: -2, reason: param.reason, cancel_time: Date.now(), } }).exec(async (err, transac) => {
                                        if (err) return sendResponse(err, null);
                                        if (transac) {
                                            await Transaction.findOne(
                                                { tid: transaction.tid },
                                                async (err, tr) => {
                                                    if (err) return sendResponse(err, null);
                                                    if (tr) {
                                                        return sendResponse(null, {
                                                            state: tr.state,
                                                            cancel_time: tr.cancel_time || 0,
                                                            transaction: tr.transaction,
                                                            create_time: tr.create_time,
                                                            perform_time: tr.perform_time || 0,
                                                        });
                                                    }
                                                }
                                            );
                                        }
                                    });
                                } else {
                                    await Transaction.updateOne(
                                        { tid: transaction.tid },
                                        { $set: { state: -2, reason: param.reason, cancel_time: Date.now(), } }
                                    ).exec(async (err, transac) => {
                                        if (err) return sendResponse(err, null);
                                        if (transac) {
                                            await Transaction.findOne(
                                                { tid: transaction.tid },
                                                async (err, tr) => {
                                                    if (err) return sendResponse(err, null);
                                                    if (tr) {
                                                        return sendResponse(null, {
                                                            state: tr.state,
                                                            cancel_time: tr.cancel_time || 0,
                                                            transaction: tr.transaction,
                                                            create_time: tr.create_time,
                                                            perform_time: tr.perform_time || 0,
                                                        });
                                                    }
                                                }
                                            );
                                        }
                                    });
                                }
                            }
                        );
                    } else {
                        return sendResponse(null, {
                            state: transaction.state,
                            cancel_time: transaction.cancel_time || 0,
                            transaction: transaction.transaction,
                            create_time: transaction.create_time,
                            perform_time: transaction.perform_time || 0,
                        });
                    }
                }
            });
        }
        async function CheckTransaction(param) {
            await Transaction.findOne({ tid: param.id }, (err, data) => {
                if (err || !data)
                    return sendResponse(BillingErrors.TransactionNotFound(), null);
                return sendResponse(null, {
                    create_time: data.create_time,
                    perform_time: data.perform_time || 0,
                    cancel_time: data.cancel_time || 0,
                    transaction: data.transaction,
                    state: data.state,
                    reason: data.reason || null,
                });
            });
        }
    } catch {
        return res.status(500).json({
            status: false,
        });
    }
};







// Tolov cheki
exports.checkoutPaycom = async (req, res, next) => {
    const { uid, amount, merchantID } = req.query;
    const tiyin = 100;
    const text = `m=${merchantID};ac.user=${uid};a=${parseInt(amount) * tiyin}`;
    const encoded = Buffer.from(text).toString("base64");
    res.redirect(`https://checkout.paycom.uz/${encoded}`);
};
