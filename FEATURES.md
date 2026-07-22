# 🛡️ Just a Chill Escrow: Feature Guide

Welcome to your self-custodial escrow platform for the XRP Ledger! This guide explains all the powerful features at your fingertips, in simple terms.

## What is "Self-Custodial Escrow"?

*   **Self-Custodial**: This means **you** are always in 100% control of your funds. Your private keys or "seed phrase" are never sent to our server or stored in your browser. All transactions are securely signed on your device using the Xaman wallet.
*   **Escrow**: This is a financial arrangement where a neutral third party holds assets on behalf of two other parties until a specific condition is met. In our case, the "neutral third party" is the **XRP Ledger network itself**—a decentralized, automated, and trustworthy system.

---

## ✨ Core Features

### 1. Secure Wallet Connection

Connect your Xaman (formerly XUMM) wallet seamlessly and securely.

*   **How it works**: Click "Connect Wallet" to generate a unique QR code. Scan it with your Xaman app to grant the platform *read-only* access to your public account information.
*   **Safety**: This process uses a "SignIn" transaction, which is the standard, secure way to connect. Your keys are never compromised.

### 2. The Escrow & Transaction Builder

This is the heart of the application. You can create complex XRPL transactions without writing any code by using pre-built templates.

*   **Timed Escrow**: Lock up XRP or tokens that can only be claimed by the recipient after a specific date and time. Perfect for vesting schedules or delayed payments.
*   **Conditional Escrow**: Lock up assets that can only be claimed if the recipient provides a secret "key" (a fulfillment). This is ideal for ensuring a task is completed before payment is released.
*   **Direct Payments**: Send XRP or any other token on the XRPL directly to another wallet.
*   **Batch Drop Tool**: Airdrop tokens to a list of recipients by simply uploading a CSV file. The tool queues up to 50 payments and signs them one by one.
*   **Account Setup**:
    *   **Enable Token Escrows**: For token issuers, this template flips the switch on your account to allow your custom token to be used in XRPL escrows.
    *   **Set a Trustline**: Before you can receive a custom token, you must set a "trustline." This template lets you do that easily.

### 3. Smart, User-Friendly Forms

The builder is packed with features to make creating transactions easy and error-free.

*   **Real-time Validation**: Get instant feedback with a green checkmark when you enter a valid XRPL address.
*   **Address History**: The form remembers addresses you've used before, so you can select them from a dropdown.
*   **Token Picker**: Instead of manually entering token details, you can pick from a list of tokens you already hold (your trustlines) or search a public directory for any token on the XRPL.
*   **Quick-Select Buttons**: Set escrow durations ("1 hour", "1 day", "1 week") or common payment amounts with a single click.
*   **Live Trustline Checker**: When sending a token, the UI automatically checks if the recipient has the required trustline and warns you if they don't.

### 4. Interactive Dashboard

Once you connect your wallet, your dashboard comes alive with real-time information from the ledger.

*   **Live Balances**: See your current XRP balance.
*   **Active Escrows**: The dashboard automatically scans the ledger for any escrows you've sent or are set to receive.
*   **Countdown Timers**: Each escrow shows a live countdown to when it can be claimed or when it expires.
*   **Direct Actions**: **Claim** or **Cancel** escrows with a single click, right from the dashboard. The app prepares the transaction and sends it to your Xaman wallet to sign.

### 5. Advanced Tools for Power Users

*   **Crypto Generator**: Create your own secure `Condition` and `Fulfillment` pairs for conditional escrows. This is done entirely in your browser, so your secret key is never exposed.
*   **Auto-Sweep Vault**: A tool for developers and advanced users. You can set up a "burner" wallet that automatically "sweeps" or sends its entire token balance to a destination address at a specific time. This is an L2 solution for time-locking tokens.
*   **Meme Lockup & Crowd-HODL**: A specialized section for the community to:
    *   **Lock Tokens**: Create individual time-locked vaults for meme tokens.
    *   **Crowd-HODL**: Participate in community pools where everyone deposits tokens into a shared vault that unlocks at a future date. Includes a live leaderboard of top depositors.
    *   **Multisig Coordination**: Set up and execute transactions that require signatures from multiple people (a "multisig" account).

### 6. Security & Transparency

*   **Human-Readable Previews**: Before you sign, a popup summarizes your transaction in plain English (e.g., "You are sending 100 XRP to...").
*   **Safety Warnings**: The app warns you about potentially risky actions, like sending a very large amount or creating an escrow that could be locked forever.
*   **Signature Audit**: A complete history of all signing requests generated through the app is available for you to review.
*   **Open Source**: The code is available for anyone to inspect, ensuring there are no hidden tricks.

---

This platform gives you the tools to use the advanced features of the XRP Ledger with confidence, knowing you are always in control.
