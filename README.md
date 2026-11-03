# Pretty Girl — Cycle Companion (Push Edition)

A private, ad-free cycle tracker that installs from Safari on iPhone. Cycle history, mood, flow, pain, and personal notes stay in this browser's local storage. Optional Web Push sends the next **estimated date** and reminder preferences to the owner's Netlify site. It does not upload cycle history or daily journals. Do not use cycle estimates as contraception.

## Deploy from GitHub

1. Import `newlinj821-jpg/PCTRACKER` into a dedicated Netlify project. Build command: `npm run build`; publish directory: `dist`. The checked-in `netlify.toml` supplies these.
2. In **Project configuration → Environment variables**, add the values below, applied to production Functions:
   - `VAPID_PUBLIC_KEY` — unique public key from setup instructions
   - `VAPID_PRIVATE_KEY` — unique private key, **never** commit this to GitHub or send it to other people
   - `VAPID_SUBJECT` — `https://github.com/newlinj821-jpg/PCTRACKER` (or a `mailto:` URL)
3. **Trigger deploy → Deploy site**. In the Functions dashboard confirm `push-reminders` and scheduled `send-period-reminders` are present.
4. Open the deployed URL in iPhone Safari → Share → Add to Home Screen → launch the installed Pretty Girl icon.
5. Log a period, then open **Settings → Push notifications**. Select lead time, notification hour, and private/explicit wording. Tap **Enable push notifications**, grant iOS permission, and tap **Send test notification**. Notifications are delivered on the phone where enabled, not automatically to another person's device.
6. To stop notifications, use the in-app **Disable notifications** control. To fully remove a record after an uncertain network failure, retry when online.

## Delivery, limitations and privacy

- Netlify scheduled function runs **hourly** in UTC and checks each subscriber's local hour; delivery is best effort, may be delayed, and free-tier execution limits apply. Scheduled functions run automatically only on published production deployments.
- Reminder schedule updates after the owner edits periods or preferences while online; if they change data offline, open the app online to resync. Future predictions are estimates.
- Only a hash of the device endpoint is used as the Netlify Blobs key. The record holds push endpoint/encryption keys, a hashed management token, estimated next period date, typical cycle length, lead days, delivery hour, timezone, and chosen wording. It **does not** contain symptom journals, flow, pain, mood, or a complete cycle history.
- Push data resides in Netlify-managed storage; local data is not encrypted at rest. Only allow access to consented devices. No trackers, ads, paid APIs or subscriptions are included.
- If you change VAPID keys after enrollment, disable/re-enable push on affected iPhones.
- This is not a medical device and estimated fertile days are not a reliable basis for contraception.

## Development

Node 20+; `npm install`, `npm test`, `npm run build`. The web app can be tested locally with `npx netlify dev` after setting environment variables. The test suite exercises reminder dates, timezone shifts and privacy-preserving notification text.
