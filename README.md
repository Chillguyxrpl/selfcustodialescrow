# 🛡️ Self-Custodial Escrow Builder for XRPL & Xaman

A fast, secure, and intuitive web application to build, manage, and deploy self-custodial escrows and multi-purpose token transactions on the XRP Ledger using the Xaman (formerly XUMM) wallet.

This project provides a beautiful frontend UI and a robust FastAPI backend that handles transaction building, fee estimation, Xaman payload generation, and secure webhook verification.

## ✨ Features

* **Smart Escrow Builder:** Easily create Time-based, Conditional, and Oracle-price-threshold escrows without writing a line of code.
* **L2 Token & MPT Support:** Send and escrow not just native XRP, but Issued Tokens (IOUs) and Multi-Purpose Tokens (MPTs).
* **Batch Drop Tool:** Upload a CSV to queue up to 50 transactions at once.
* **Real-time Validations:** Instant r-Address validation, Trustline checking, and live network fee estimation.
* **Seamless Xaman Integration:** Sign in via QR code or mobile deep-link, and receive Push Notifications to sign transactions directly on your phone.
* **Active Escrow Dashboard:** Scan any account to view, claim, or cancel active escrows directly from the UI.
* **100% Non-Custodial:** Private keys and seeds are **never** sent to or stored by the server. All transaction signing for automated features (such as the L2 Vault Monitor) occurs entirely locally in your browser's memory.

---

## 🚀 Getting Started

### Prerequisites
* Python 3.12
* A Xaman Developer Console account (to get your API Keys)

### 1. Installation
Clone the repository, create a virtual environment, and install the dependencies:

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate 
# Mac/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

2. Configure environment (see `.env.example`). Set `XUMM_API_KEY` and `XUMM_API_SECRET` to use payload creation and status polling.

3. Run the app:

```bash
uvicorn main:app --reload
```

4. Webhook setup: In XUMM Developer Console configure a webhook URL that points to `https://your-server/xumm/webhook`.

Local webhook testing with ngrok

- Option A — manual: install ngrok (https://ngrok.com/) and run:

```bash
ngrok http 8000
```

- Option B — helper script: use the included helper to start ngrok and copy the public URL to clipboard:

```bash
python start_ngrok.py
```

- Copy the generated `https://...ngrok.io` URL and set your XUMM webhook to `https://...ngrok.io/xumm/webhook` in the XUMM Developer Console.

Verifying webhooks

- The server stores incoming webhook payloads in the PostgreSQL database.
- Use the UI at `http://localhost:8000` to build a payload; set the XUMM webhook in the console to point at your ngrok URL before creating the payload.
- After XUMM posts updates to `/xumm/webhook`, verify by calling the verification endpoint (or use the UI):

- Automatic webhook registration: if you want the server to request XUMM to call your webhook for each payload, set the `XUMM_WEBHOOK_URL` environment variable (for example to your ngrok URL + `/xumm/webhook`) before creating payloads. The server will include this URL when creating the payload.
- Webhook signature verification: set the `XUMM_WEBHOOK_SECRET` environment variable to the secret used by XUMM for webhook signing. Incoming webhook requests are verified before being stored.
- Delivery retries: if local database storage is transiently busy, the server retries writes several times before returning a 503 status so XUMM can retry delivery.

After XUMM posts updates to `/xumm/webhook`, verify by calling the verification endpoint (or use the UI):

```
GET /xumm/verify/{uuid}
```

For a richer comparison report that includes stored local webhook data and the latest XUMM payload state, use:

```
GET /xumm/payload_report/{uuid}
```

This will fetch the authoritative payload from XUMM and compare `meta.state` with the locally stored webhook copy to confirm delivery and consistency.

Security notes
- Do NOT store user seeds or private keys on the server.
- Use HTTPS for public deployment and restrict origins as needed.
