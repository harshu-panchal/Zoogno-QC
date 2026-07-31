import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const { verifyCodPayment } = await import("./app/controller/deliveryController.js");
    const req = { body: { merchantOrderId: "COD-REMIT-1785493767047-149" } };
    const res = {
      status: function(c) {
        return {
          json: function(d) { console.log("Response JSON:", c, d); },
          send: function(d) { console.log("Response SEND:", c, d); }
        };
      },
      json: function(d) { console.log("Response JSON:", d); }
    };
    try {
      await verifyCodPayment(req, res);
    } catch (e) {
      console.error("Caught Exception:", e);
    }
    process.exit(0);
  });
