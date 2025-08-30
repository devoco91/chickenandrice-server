// routes/emailRoutes.js
import express from "express";
import { sendEmail } from "../server.js";

const router = express.Router();

router.post("/send-sales-report", async (req, res) => {
  try {
    const { amount, cash, card, transfer, date } = req.body;

    if (!amount || !date) {
      return res.status(400).json({ error: "Missing amount or date" });
    }

    // ✅ Styled HTML email with breakdown
    const html = `
      <h2>Chicken & Rice Ltd - Daily Sales Report</h2>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Total Sales:</strong> ₦${Number(amount).toLocaleString()}</p>

      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin-top:10px; font-family: Arial, sans-serif;">
        <thead style="background:#f4f4f4;">
          <tr>
            <th align="left">Payment Mode</th>
            <th align="right">Amount (₦)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cash</td>
            <td align="right">${Number(cash || 0).toLocaleString()}</td>
          </tr>
          <tr>
            <td>Card</td>
            <td align="right">${Number(card || 0).toLocaleString()}</td>
          </tr>
          <tr>
            <td>Transfer</td>
            <td align="right">${Number(transfer || 0).toLocaleString()}</td>
          </tr>
          <tr style="font-weight:bold; background:#fafafa;">
            <td>Total</td>
            <td align="right">${Number(amount || 0).toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <br/>
      <p>Regards,</p>
      <p><em>Chicken & Rice System</em></p>
    `;

    await sendEmail({
      subject: `Daily Sales Report - ${date}`,
      html,
    });

    res.json({ success: true, message: "Sales report email sent successfully" });
  } catch (err) {
    console.error("❌ Error sending sales report:", err.message);
    res.status(500).json({ error: "Failed to send sales report" });
  }
});

export default router;
