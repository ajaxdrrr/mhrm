// functions/src/index.ts
import axios from "axios";
import * as functions from "firebase-functions/v1";

// HTTP function to create a Xendit invoice
export const createXenditInvoice = functions
  .region("asia-southeast1") // deploy region
  .https.onRequest(async (req, res): Promise<void> => {
    // Basic CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // ✅ Use environment variable instead of functions.config()
    const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY ?? "";

    if (!XENDIT_SECRET_KEY) {
      console.error("Xendit secret key missing in environment");
      res.status(500).json({ error: "Xendit secret key not configured" });
      return;
    }

    try {
      const { amount, description, userId } = (req.body as any) || {};

      if (!amount || !userId) {
        res.status(400).json({
          error: "Missing required fields: amount, userId",
        });
        return;
      }

      const externalId = `user_${userId}_${Date.now()}`;

      const xenditRes = await axios.post(
        "https://api.xendit.co/v2/invoices",
        {
          external_id: externalId,
          amount,
          description: description || "Receipt Manager Pro Plan",
          success_redirect_url:
            "https://your-app-domain.com/payment-success",
          failure_redirect_url:
            "https://your-app-domain.com/payment-failed",
        },
        {
          auth: {
            username: XENDIT_SECRET_KEY,
            password: "",
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      // ✅ Don't return the Response; just send it
      res.status(200).json({
        invoice_url: xenditRes.data.invoice_url,
        id: xenditRes.data.id,
        status: xenditRes.data.status,
      });
      return;
    } catch (err: any) {
      console.error("Xendit error:", err?.response?.data || err.message);
      res.status(500).json({
        error: "Failed to create Xendit invoice",
        details: err?.response?.data || err.message,
      });
      return;
    }
  });
