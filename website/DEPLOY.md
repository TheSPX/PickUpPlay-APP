# Deploying the PickupPlay website

Static site — no build step.

1. In `index.html`, set the Android button (`id="apkLink"`) to your APK download link.
2. Replace `hello@pickupplay.app` in `index.html` and `privacy.html` with your contact email.
3. Deploy the `website` folder:
   - **Netlify:** drag the folder onto app.netlify.com/drop
   - **Vercel:** `cd website && npx vercel --prod`
   - **GitHub Pages:** Settings → Pages → deploy from branch, folder `/website` (or copy it to `/docs`)

— TheSPX
